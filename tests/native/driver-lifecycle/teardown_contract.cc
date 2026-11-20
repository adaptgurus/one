// Native stream/driver lifetime checks. Disposable processes and pipes only.
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <fstream>
#include <iostream>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
#include <csignal>
#include <fcntl.h>
#include <sys/wait.h>
#include <unistd.h>
#include "StreamManager.h"
#define private public
#include "Driver.h"
#undef private
struct TestMessage
{
    enum class msg_enum { UNDEFINED };
    msg_enum type() const {return msg_enum::UNDEFINED;}
    void parse_from(const std::string&) {}
    void write_to(int fd) const {(void)::write(fd,"EVENT\n",6);}
    int write_to(std::string& out) const {out="EVENT\n";return 0;}
};
static int fake_child()
{
    std::string line;
    while(std::getline(std::cin,line))
    {
        if(line=="INIT")std::cout<<"INIT SUCCESS\n"<<std::flush;
        else if(line=="FINALIZE")return 0;
        else if(line=="EVENT")std::cout<<"EVENT\n"<<std::flush;
    }
    return 0;
}
static bool cancelled_partial_line()
{
    int pipefd[2];if(pipe(pipefd))return false;
    StreamManager<TestMessage> stream(pipefd[0],[](std::unique_ptr<TestMessage>){});
    std::atomic<bool> done{false};
    std::thread reader([&]{stream.action_loop(0);done=true;});
    (void)write(pipefd[1],"UNFINISHED",10);
    std::this_thread::sleep_for(std::chrono::milliseconds(30));
    stream.request_stop();
    auto end=std::chrono::steady_clock::now()+std::chrono::milliseconds(500);
    while(!done && std::chrono::steady_clock::now()<end)std::this_thread::yield();
    const bool cancelled=done.load();
    close(pipefd[1]);reader.join();stream.drain();
    return cancelled;
}
static bool descriptor_not_closed_twice(const std::string& exe)
{
    auto driver=std::make_unique<Driver<TestMessage>>(exe,"--fake",0);
    std::string error;if(driver->start(error))return false;
    const int former_fd=driver->from_drv;
    driver->stop(1);
    const int file=open("/dev/null",O_RDWR|O_CLOEXEC);
    if(file<0)return false;
    if(file!=former_fd){if(dup2(file,former_fd)<0)return false;close(file);}
    driver.reset();
    const bool alive=fcntl(former_fd,F_GETFD)>=0;
    if(alive)close(former_fd);
    return alive;
}
static bool admitted_callback_drained(const std::string& exe)
{
    std::mutex mutex;std::condition_variable condition;
    bool entered=false,release=false,finished=false;
    std::atomic<int> calls{0};std::atomic<bool> stopped{false};
    Driver<TestMessage> driver(exe,"--fake",1);
    driver.register_action(TestMessage::msg_enum::UNDEFINED,[&](std::unique_ptr<TestMessage>)
    {
        ++calls;std::unique_lock<std::mutex> lock(mutex);entered=true;condition.notify_all();
        condition.wait(lock,[&]{return release;});finished=true;condition.notify_all();
    });
    std::string error;if(driver.start(error))return false;
    driver.write("EVENT\nEVENT\n");
    {std::unique_lock<std::mutex> lock(mutex);if(!condition.wait_for(lock,std::chrono::seconds(2),[&]{return entered;}))return false;}
    std::thread stopper([&]{driver.stop(0);stopped=true;});
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    const bool waited=!stopped.load();
    {std::lock_guard<std::mutex> lock(mutex);release=true;}
    condition.notify_all();stopper.join();
    {std::unique_lock<std::mutex> lock(mutex);condition.wait_for(lock,std::chrono::seconds(2),[&]{return finished;});}
    return waited && finished && calls==1 && stopped;
}
static bool stop_is_terminal_and_idempotent(const std::string& exe)
{
    Driver<TestMessage> driver(exe,"--fake",0);std::string error;
    if(driver.start(error))return false;
    if(driver.start(error)==0)return false;
    std::thread one([&]{driver.stop(0);});std::thread two([&]{driver.stop(0);});one.join();two.join();
    return driver.start(error)==-1 && driver.pid==-1 && driver.to_drv==-1 && driver.from_drv==-1;
}
static bool failed_exec_is_reaped()
{
    Driver<TestMessage> driver("/nonexistent/ls-disposable-driver-test","",0);std::string error;
    return driver.start(error)==-1 && driver.pid==-1 && driver.to_drv==-1 && driver.from_drv==-1;
}
int main(int argc,char**)
{
    if(argc==2)return fake_child();
    signal(SIGPIPE,SIG_IGN);char path[4096];auto n=readlink("/proc/self/exe",path,sizeof(path)-1);
    if(n<=0)return 2;
    path[n]='\0';const std::string exe(path);
    int failures=0;
    const std::vector<std::pair<std::string,bool>> cases={
        {"partial_line_cancellation",cancelled_partial_line()},
        {"read_descriptor_single_owner",descriptor_not_closed_twice(exe)},
        {"admitted_callback_drain_and_no_new_callback",admitted_callback_drained(exe)},
        {"terminal_and_concurrent_idempotent_stop",stop_is_terminal_and_idempotent(exe)},
        {"failed_child_exec_reaped",failed_exec_is_reaped()}
    };
    for(const auto& item:cases){std::cout<<(item.second?"PASS ":"FAIL ")<<item.first<<"\n";failures+=!item.second;}
    return failures?1:0;
}
