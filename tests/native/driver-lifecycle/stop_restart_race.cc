// Deterministic regression on the actual native Driver template. No host/VM APIs.
// A real disposable child closes stdout but remains alive. Pause its listener
// inside stop_driver(1), request terminal stop, then permit restart to proceed.
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
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#include "StreamManager.h"

static std::mutex gate_mutex;
static std::condition_variable gate_cv;
static bool entered=false, released=false;
static std::atomic<bool> used{false};
static unsigned int test_pause(unsigned int seconds)
{
    if (seconds==1 && !used.exchange(true))
    {
        std::unique_lock<std::mutex> lock(gate_mutex);
        entered=true;gate_cv.notify_all();
        gate_cv.wait(lock,[]{return released;});
        return 0;
    }
    std::this_thread::sleep_for(std::chrono::seconds(seconds));
    return 0;
}
// Only expose native Driver internals to observe terminal intent. StreamManager
// and standard-library headers are already parsed with their original access.
#define private public
#define sleep test_pause
#include "Driver.h"
#undef sleep
#undef private

struct TestMessage
{
    enum class msg_enum { UNDEFINED };
    msg_enum type() const {return msg_enum::UNDEFINED;}
    void parse_from(const std::string&) {}
    void write_to(int fd) const {(void)::write(fd,"TEST\n",5);}
    int write_to(std::string& out) const {out="EVENT\n";return 0;}
};
static int child(const std::string& directory)
{
    { std::ofstream out(directory+"/generations",std::ios::app);out<<getpid()<<"\n"; }
    std::string line;
    while (std::getline(std::cin,line))
    {
        if (line=="INIT") {std::cout<<"INIT SUCCESS\n"<<std::flush;}
        else if (line=="EOF") {::close(STDOUT_FILENO);for(;;)::pause();}
        else if (line=="FINALIZE") {return 0;}
    }
    return 0;
}
static std::vector<pid_t> generations(const std::string& directory)
{
    std::ifstream in(directory+"/generations");std::vector<pid_t> pids;pid_t pid;
    while(in>>pid)pids.push_back(pid);
    return pids;
}
int main(int argc,char** argv)
{
    if(argc==2)return child(argv[1]);
    signal(SIGPIPE,SIG_IGN);
    char tmp[]="/tmp/ls-driver-stop-test-XXXXXX";
    if(!mkdtemp(tmp)){perror("mkdtemp");return 2;}
    char exe[4096];ssize_t length=readlink("/proc/self/exe",exe,sizeof(exe)-1);
    if(length<=0)return 2;
    exe[length]='\0';
    bool failed=false;std::string directory(tmp),error;
    {
        Driver<TestMessage> driver(exe,directory,0);
        if(driver.start(error)!=0){std::cerr<<error;return 2;}
        driver.write("EOF\n");
        {
            std::unique_lock<std::mutex> lock(gate_mutex);
            if(!gate_cv.wait_for(lock,std::chrono::seconds(3),[]{return entered;}))
            {std::cerr<<"listener never reached controlled restart boundary\n";return 2;}
        }
        std::thread stop([&]{driver.stop(0);});
        const auto limit=std::chrono::steady_clock::now()+std::chrono::seconds(2);
        while(!driver.terminate.load() && std::chrono::steady_clock::now()<limit)
            std::this_thread::yield();
        if(!driver.terminate.load())failed=true;
        {std::lock_guard<std::mutex> lock(gate_mutex);released=true;}
        gate_cv.notify_all();stop.join();
        std::this_thread::sleep_for(std::chrono::milliseconds(250));
        const auto pids=generations(directory);
        if(pids.size()!=1)
        {
            std::cerr<<"FAIL: replacement child spawned after terminal stop; generations="<<pids.size()<<"\n";
            failed=true;
        }
        // Cleanup stays limited to this exact test Driver's owned child.
        driver.stop(0);
    }
    for(pid_t pid:generations(directory))
    {int status;while(waitpid(pid,&status,0)==-1 && errno==EINTR){}}
    unlink((directory+"/generations").c_str());rmdir(directory.c_str());
    if(!failed)std::cout<<"PASS: no child restart after terminal stop; native listener joined\n";
    return failed?1:0;
}
