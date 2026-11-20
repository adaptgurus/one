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

#ifndef STREAM_MANAGER_H
#define STREAM_MANAGER_H

#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <string.h>

#include <map>
#include <thread>
#include <memory>
#include <string>
#include <functional>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <stdexcept>
#include <sys/eventfd.h>

#include "Message.h"
#include "StringBuffer.h"

/**
 *  This class manages a stream to process Messages. The StreamManager
 *  thread reads from the stream for input messages and executed the associated
 *  action in a separated (detached) thread.
 */
template <typename MSG>
class StreamManager
{
public:
    using callback_t = std::function<void(std::unique_ptr<MSG>)>;

    /* ---------------------------------------------------------------------- */
    /* ---------------------------------------------------------------------- */
    /**
     *  @param fd file descriptor for the stream
     *  @param error_cbk function to execute on error (parse error or UNDEFINED)
     */
    StreamManager(int __fd, callback_t error_cbk):_fd(__fd),
        _stop_fd(eventfd(0, EFD_CLOEXEC | EFD_NONBLOCK))
    {
        if (_stop_fd < 0) throw std::runtime_error("Cannot create stream cancellation event");
        register_action(MSG::msg_enum::UNDEFINED, error_cbk);
    };

    StreamManager(callback_t error_cbk):StreamManager(-1, error_cbk) {};

    StreamManager():StreamManager(-1, [](std::unique_ptr<MSG>) {}) {};

    virtual ~StreamManager()
    {
        request_stop();
        drain();
        if (_fd >= 0) close(_fd);
        close(_stop_fd);
    };

    // Terminal, idempotent stop. The caller owns/join()s its reader thread.
    void request_stop()
    {
        _stopping.store(true);
        uint64_t wake = 1;
        ssize_t result;
        do { result = ::write(_stop_fd, &wake, sizeof(wake)); }
        while (result < 0 && errno == EINTR);
        // EAGAIN means the event is already latched and readable.
        _cond.notify_all();
    }

    // Borrowed descriptor: latched readable after terminal stop. Callers must
    // not read/close it; it wakes every in-flight pipe or accepted-socket poll.
    int cancellation_fd() const { return _stop_fd; }

    void drain()
    {
        std::unique_lock<std::mutex> lock(_mutex);
        _cond.wait(lock, [this] { return _active == 0; });
    }

    /**
     * Associate a function to be executed when a message of the given type is
     * read
     *   @param t the message type
     *   @param a callback function to be executed
     */
    void register_action(typename MSG::msg_enum t, callback_t a);

    /**
     *  Reads messages from the stream and execute callbacks. This method should
     *  be run in a separated thread.
     *    @param concurrency number of concurrent actions, use 0 to run all the
     *    actions sequetianlly in this thread.
     */
    virtual int action_loop(int concurrency);

    /**
     *  Sets the file descriptor for the stream
     *    @param fd file descriptor
     */
    void fd(int __fd)
    {
        // Called only before the reader starts or by that reader at EOF.
        if (_fd >= 0 && _fd != __fd) close(_fd);
        _fd = __fd;
        buffer.reset();
    }

    /**
     *  Look for the associated callback for the message and execute it
     *    @param msg read from the stream
     */
    void do_action(std::unique_ptr<MSG>& msg, bool threaded);

protected:
    /**
     *  Read a line from the stream
     *    @return -1 in case of error or EOL
     */
    virtual int read_line(std::string& line)
    {
        return buffer.read_line(_fd, line, _stop_fd);
    }

private:
    int _fd;
    const int _stop_fd;
    std::atomic<bool> _stopping{false};
    int _active = 0;

    void finished_action()
    {
        std::lock_guard<std::mutex> lock(_mutex);
        ++_concurrency;
        --_active;
        // This must be the worker's final member access before releasing the
        // mutex. drain() may permit destruction immediately after it sees 0.
        _cond.notify_all();
    }

    std::mutex _mutex;

    std::condition_variable _cond;

    int _concurrency = 0;

    std::map<typename MSG::msg_enum, callback_t > actions;

    StringBuffer buffer;
};

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* Stream Manager Implementation                                              */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

template<typename MSG>
void StreamManager<MSG>
::register_action(typename MSG::msg_enum t, callback_t a)
{
    auto ret = actions.insert({t, a});

    if (!ret.second)
    {
        ret.first->second = a;
    }
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

template<typename MSG>
void StreamManager<MSG>
::do_action(std::unique_ptr<MSG>& msg, bool thr)
{
    const auto it = actions.find(msg->type());

    if (it == actions.end())
    {
        return;
    }

    const auto action = it->second;

    if (thr)
    {
        std::unique_lock<std::mutex> lock(_mutex);
        _cond.wait(lock, [this] { return _stopping.load() || _concurrency > 0; });
        if (_stopping.load()) return;
        --_concurrency;
        ++_active;
        MSG * mptr = msg.release();
        lock.unlock();
        try
        {
            std::thread([this, action, mptr]
            {
                try { action(std::unique_ptr<MSG>{mptr}); }
                catch (...) { finished_action(); throw; }
                finished_action();
            }).detach();
        }
        catch (...)
        {
            delete mptr;
            finished_action();
            throw;
        }
    }
    else if (!_stopping.load())
    {
        action(std::move(msg));
    }
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

template<typename MSG>
int StreamManager<MSG>
::action_loop(int concurrency)
{
    bool threaded = concurrency > 0;
    {
        std::lock_guard<std::mutex> lock(_mutex);
        _concurrency = concurrency - _active;
    }

    while (!_stopping.load())
    {
        std::string line;

        if (read_line(line) != 0)
        {
            return -1;
        }

        if (line.empty())
        {
            continue;
        }

        std::unique_ptr<MSG> msg{new MSG};

        msg->parse_from(line);

        do_action(msg, threaded); //Errors are handled by the UNDEFINED action
    }

    return 0;
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

#endif /*STREAM_MANAGER_H*/
