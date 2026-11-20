/* -------------------------------------------------------------------------- */
/* Copyright 2002-2026, OpenNebula Project, OpenNebula Systems                */
/*                                                                            */
/* Licensed under the Apache License, Version 2.0 (the "License"); you may    */
/* not use this file except in compliance with the License. You may obtain    */
/* a copy of the License at                                                   */
/*                                                                            */
/* http://www.apache.org/licenses/LICENSE-2.0                                 */
/*                                                                            */
/* Unless required by applicable law or agreed to in writing, software        */
/* distributed under the License is distributed on an "AS IS" BASIS,          */
/* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.   */
/* See the License for the specific language governing permissions and        */
/* limitations under the License.                                             */
/* -------------------------------------------------------------------------- */

#ifndef DRIVER_H_
#define DRIVER_H_

#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#include <fcntl.h>
#include <string.h>

#include <string>
#include <thread>
#include <atomic>
#include <mutex>
#include <chrono>
#include "StreamManager.h"

/**
 *  This class wraps the execution of a driver and setups a pipe as communication
 *  channel
 */
template <typename MSG>
class Driver
{
public:
    using message_t = MSG;

    /**
     *  A call to the start() method is needed to start the driver
     *    @param c the command to execute the driver
     *    @param a the arguments for the command
     *    @param ct max number of concurrent threads
     */
    Driver(const std::string& c, const std::string& a, int ct)
        : cmd(c)
        , arg(a)
        , concurrency(ct)
    {}

    ~Driver()
    {
        stop(1);
    }

    /**
     *  Starts the driver and listener thread.
     *    @param error string
     *    @return 0 on success
     */
    int start(std::string& error)
    {
        std::lock_guard<std::mutex> lock(lifecycle_mutex);
        if (terminate.load() || pid > 0 || stream_thr.joinable())
        {
            error = "Driver is already active or has been stopped";
            return -1;
        }
        if (start_driver(error) == -1)
        {
            stop_driver(0);
            return -1;
        }
        int reader_fd = fcntl(from_drv, F_DUPFD_CLOEXEC, 0);
        if (reader_fd < 0)
        {
            error = "Cannot duplicate driver reader";
            stop_driver(0);
            return -1;
        }
        streamer.fd(reader_fd);
        start_listener();
        return 0;
    }

    /**
     *  Stop the driver and the listener thread
     *    @param secs seconds to wait for the process to finish
     */
    void stop(int secs)
    {
        // Terminal intent precedes the lifecycle lock: a listener already
        // retiring a failed child must observe stop before spawning another.
        terminate.store(true);
        streamer.request_stop();
        std::lock_guard<std::mutex> join_lock(stop_mutex);
        {
            std::lock_guard<std::mutex> lock(lifecycle_mutex);
            stop_driver(secs);
        }
        if (stream_thr.joinable() && stream_thr.get_id() != std::this_thread::get_id())
        {
            stream_thr.join();
        }
        streamer.drain();
    }

    /**
     *  Send a message string to the driver
     */
    void write(const std::string&  str) const
    {
        write_cancellable(str);
    };

    /**
     *  Send a message to the driver
     */
    void write(const MSG& msg) const
    {
        std::string serialized;
        if (msg.write_to(serialized) == 0) write_cancellable(serialized);
    };

    /**
     *  Register an action for a given message type. This function needs to be
     *  call before using start
     *    @param t message type
     *    @param a callback function
     */
    void register_action(typename MSG::msg_enum t,
                         std::function<void(std::unique_ptr<MSG>)> a)
    {
        streamer.register_action(t, a);
    };

    /**
     *  Set a callback to be called when the driver is restarted and reconnects
     */
    void set_reconnect_callback(std::function<void()> callback)
    {
        reconnect_callback = callback;
    }

protected:
    Driver() = default;

    void cmd_(const std::string& c) { cmd = c; }

    void arg_(const std::string& a) { arg = a; }

    void concurency_(int c) { concurrency = c; }

private:
    /**
     *  Communication pipe file descriptor (daemon <- driver)
     */
    int from_drv = -1;

    /**
     *  Communication pipe file descriptor (daemon -> driver)
     */
    int to_drv = -1;

    /**
     *  Driver configuration: path and arguments
     */
    std::string cmd;

    std::string arg;

    int  concurrency = 0;

    /**
     *  Process ID of the driver
     */
    pid_t pid = -1;

    /**
     *  Class to read lines from the stream
     */
    StreamManager<MSG> streamer;

    std::thread stream_thr;

    /**
     *  sync listner thread termination
     */
    std::atomic<bool> terminate = {false};
    mutable std::mutex lifecycle_mutex;
    std::mutex stop_mutex;
    mutable std::mutex write_mutex;

    int duplicate_writer() const
    {
        std::lock_guard<std::mutex> lock(lifecycle_mutex);
        if (terminate.load() || to_drv < 0) return -1;
        return fcntl(to_drv, F_DUPFD_CLOEXEC, 0);
    }

    void write_cancellable(const std::string& data) const
    {
        // Serialize protocol messages, but never hold the lifecycle lock while
        // a child is back-pressured. Nonblocking mode is set before any writer
        // gets this descriptor, so terminal stop can always cancel the wait.
        std::lock_guard<std::mutex> message_lock(write_mutex);
        const int fd = duplicate_writer();
        if (fd < 0) return;
        size_t offset = 0;
        while (offset < data.size() && !terminate.load())
        {
            const auto written = ::write(fd, data.data() + offset, data.size() - offset);
            if (written > 0) { offset += static_cast<size_t>(written); continue; }
            if (written < 0 && errno == EINTR) continue;
            if (written < 0 && (errno == EAGAIN || errno == EWOULDBLOCK))
            {
                pollfd fds[2] = {{fd, POLLOUT, 0}, {streamer.cancellation_fd(), POLLIN, 0}};
                int ready;
                do { ready = poll(fds, 2, -1); } while (ready < 0 && errno == EINTR);
                if (ready <= 0 || fds[1].revents != 0 ||
                    (fds[0].revents & (POLLERR | POLLHUP | POLLNVAL))) break;
                continue;
            }
            break;
        }
        close(fd);
    }

    /**
     *  Reconnect callback, called when the driver restarts
     */
    std::function<void()> reconnect_callback;

    /**
     *  Starts the driver. This function creates a new process and sets up the
     *  communication pipes.
     *    @param error string
     *    @return 0 on success
     */
    int start_driver(std::string& error);

    /**
     *  Stop the driver, closes the pipes.
     *    @param secs seconds to wait for the process to finish
     */
    void stop_driver(int secs);

    /**
     *  Starts the listener thread. The thread will reload the driver process if
     *  it fails (EOF on pipe)
     */
    void start_listener();
};

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* Driver Template Implementation                                             */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

template<typename MSG>
void Driver<MSG>
::stop_driver(int secs)
{
    const pid_t owned_pid = pid;
    pid = -1;
    if (to_drv >= 0)
    {
        // Shutdown must not wait forever for space in an unresponsive pipe.
        int flags = fcntl(to_drv, F_GETFL);
        if (flags >= 0) (void) fcntl(to_drv, F_SETFL, flags | O_NONBLOCK);
        const char finalize[] = "FINALIZE\n";
        (void) ::write(to_drv, finalize, sizeof(finalize) - 1);
        close(to_drv);
        to_drv = -1;
    }
    // StreamManager owns a distinct read descriptor and a cancellation event;
    // closing this lifecycle descriptor cannot be reused under a blocked read.
    if (from_drv >= 0) {close(from_drv);from_drv = -1;}
    if (owned_pid <= 0) return;
    bool reaped = false;
    for (int i = 0; i < secs; ++i)
    {
        int status;
        const auto result = waitpid(owned_pid, &status, WNOHANG);
        if (result == owned_pid || (result < 0 && errno == ECHILD))
        {reaped = true;break;}
        if (result < 0 && errno != EINTR) break;
        sleep(1);
    }
    if (!reaped)
    {
        int status;
        const auto result = waitpid(owned_pid, &status, WNOHANG);
        if (result == owned_pid || (result < 0 && errno == ECHILD)) return;
        (void) kill(owned_pid, SIGKILL);
        while (waitpid(owned_pid, &status, 0) < 0 && errno == EINTR) {}
    }
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

template<typename MSG>
int Driver<MSG>
::start_driver(std::string& error)
{
    // Open communication pipes
    int to_drv_pipe[2];
    int from_drv_pipe[2];

    if (pipe2(to_drv_pipe, O_CLOEXEC) == -1)
    {
        error = "Cannot create driver pipes, ";
        error.append(strerror(errno));

        return -1;
    }

    if (pipe2(from_drv_pipe, O_CLOEXEC) == -1)
    {
        close(to_drv_pipe[0]);close(to_drv_pipe[1]);
        error = "Cannot create driver output pipe";
        return -1;
    }

    //Create a new process for the driver
    pid = fork();

    switch (pid)
    {
        case -1: // Error
            close(to_drv_pipe[0]);close(to_drv_pipe[1]);
            close(from_drv_pipe[0]);close(from_drv_pipe[1]);
            error = "Error forking to start driver, ";
            error.append(strerror(errno));
            return -1;

        case 0:  // Child process (driver)
            close(to_drv_pipe[1]);
            close(from_drv_pipe[0]);

            if ( dup2(to_drv_pipe[0], 0) != 0 || dup2(from_drv_pipe[1], 1) != 1 )
            {
                _exit(127);
            }

            close(to_drv_pipe[0]);
            close(from_drv_pipe[1]);

            close(2);

            execlp(cmd.c_str(), cmd.c_str(), arg.c_str(), (char*)NULL);

            _exit(127);

        default:
            break;
    }

    // Parent process (daemon)
    close(to_drv_pipe[0]);
    close(from_drv_pipe[1]);

    to_drv   = to_drv_pipe[1];
    from_drv = from_drv_pipe[0];

    fcntl(to_drv, F_SETFD, FD_CLOEXEC);
    fcntl(from_drv, F_SETFD, FD_CLOEXEC);
    const int writer_flags = fcntl(to_drv, F_GETFL);
    if (writer_flags < 0 || fcntl(to_drv, F_SETFL, writer_flags | O_NONBLOCK) < 0)
    {
        error = "Cannot make driver writer cancellable";
        return -1;
    }

    //Send INIT command and wait for response (INIT [SUCCESS|FAILURE]) up to 10s
    char   buffer[32];
    fd_set rfds;

    struct timeval tv;

    FD_ZERO(&rfds);
    FD_SET(from_drv, &rfds);

    tv.tv_sec  = 10;
    tv.tv_usec = 0;

    if (::write(to_drv, "INIT\n", 5) != 5)
    {
        error = "Driver initialization write failed";
        return -1;
    }

    int rc = select(from_drv + 1, &rfds, 0, 0, &tv);

    if ( rc <= 0 )
    {
        error = "Driver initialization time out\n";
        return -1;
    }

    rc = read(from_drv, (void *) buffer, sizeof(char) * 31);

    if ( rc < 0 )
    {
        error = "Driver initialization failed, unable to read from driver\n";
        return -1;
    }

    buffer[rc]='\0';

    std::istringstream iss(buffer);

    std::string action;
    std::string result;

    iss >> action >> result >> std::ws;

    if ( action != "INIT" || result != "SUCCESS" )
    {
        error = "Driver initialization failed, expected INIT SUCCESS message\n";
        return -1;
    }

    return 0;
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

template<typename MSG>
void Driver<MSG>
::start_listener()
{
    stream_thr = std::thread([this]()
    {
        while (!terminate.load() && streamer.action_loop(concurrency) == -1)
        {
            bool restarted = false;
            while (!terminate.load() && !restarted)
            {
                {
                    std::lock_guard<std::mutex> lock(lifecycle_mutex);
                    if (terminate.load()) break;
                    std::string error;
                    stop_driver(1);
                    if (terminate.load()) break;
                    if (start_driver(error) == 0)
                    {
                        const int reader_fd = fcntl(from_drv, F_DUPFD_CLOEXEC, 0);
                        if (reader_fd >= 0)
                        {
                            streamer.fd(reader_fd);
                            restarted = true;
                        }
                    }
                    if (!restarted) stop_driver(0);
                }
                if (!restarted && !terminate.load())
                    std::this_thread::sleep_for(std::chrono::milliseconds(100));
            }
            if (restarted && !terminate.load() && reconnect_callback)
                reconnect_callback();
        }
    });
}

#endif /*DRIVER_H_*/
