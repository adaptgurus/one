// Real native I/O cancellation regressions. Only owned loopback sockets/children.
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
#include <csignal>
#include <poll.h>
#include <arpa/inet.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <unistd.h>
#include "Driver.h"
#include "TCPStream.h"
struct TestMessage
{
    enum class msg_enum { UNDEFINED };
    msg_enum type() const {return msg_enum::UNDEFINED;}
    std::string payload;
    void parse_from(const std::string& text) {payload=text;}
    void write_to(int fd) const {(void)::write(fd,"EVENT\n",6);}
    int write_to(std::string& text) const {text="EVENT\n";return 0;}
};
static int consuming_child()
{
    std::string text;
    while(std::getline(std::cin,text))
    {
        if(text=="INIT")std::cout<<"INIT SUCCESS\n"<<std::flush;
        else if(text=="FINALIZE")return 0;
        else
        {
            const bool valid=text.size()==1024*1024 &&
                (text.front()=='A' || text.front()=='B') &&
                text.find_first_not_of(text.front())==std::string::npos;
            std::cout<<(valid?"ACK":"BAD")<<"\n"<<std::flush;
        }
    }
    return 0;
}
static bool complete_serialized_messages(const std::string& executable)
{
    Driver<TestMessage> driver(executable,"--reader",0);
    std::atomic<int> acknowledgements{0},bad{0};std::string error;
    driver.register_action(TestMessage::msg_enum::UNDEFINED,[&](std::unique_ptr<TestMessage> msg)
    {if(msg->payload=="ACK\n")++acknowledgements;else ++bad;});
    if(driver.start(error))return false;
    std::thread a([&]{driver.write(std::string(1024*1024,'A')+"\n");});
    std::thread b([&]{driver.write(std::string(1024*1024,'B')+"\n");});
    a.join();b.join();
    const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(3);
    while(acknowledgements+bad<2 && std::chrono::steady_clock::now()<until)std::this_thread::yield();
    driver.stop(1);return acknowledgements==2 && bad==0;
}

static int stalled_child(const std::string& directory)
{
    std::string text;if(!std::getline(std::cin,text) || text!="INIT")return 2;
    std::cout<<"INIT SUCCESS\n"<<std::flush;
    pid_t descendant=fork();
    if(descendant<0)return 2;
    if(descendant==0)
    {
        close(STDOUT_FILENO);close(STDERR_FILENO);
        for(;;)pause(); // Intentionally retains only this disposable driver's input.
    }
    {std::ofstream out(directory+"/descendant");out<<descendant<<"\n";}
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    std::cout<<"EVENT\n"<<std::flush;
    for(;;)pause();
}
static bool blocked_callback_write_cancelled(const std::string& executable)
{
    char pattern[]="/tmp/ls-driver-blocked-XXXXXX";
    if(!mkdtemp(pattern))return false;
    std::string directory(pattern),error;
    std::mutex mutex;std::condition_variable condition;bool entered=false;
    std::atomic<bool> stopped{false},callback_done{false};
    Driver<TestMessage> driver(executable,directory,1);
    driver.register_action(TestMessage::msg_enum::UNDEFINED,[&](std::unique_ptr<TestMessage>)
    {
        {std::lock_guard<std::mutex> lock(mutex);entered=true;}
        condition.notify_all();
        driver.write(std::string(8*1024*1024,'x')+"\n");
        callback_done=true;
    });
    if(driver.start(error)){std::cerr<<error;return false;}
    {std::unique_lock<std::mutex> lock(mutex);if(!condition.wait_for(lock,std::chrono::seconds(3),[&]{return entered;}))return false;}
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    std::thread stopper([&]{driver.stop(0);stopped=true;});
    auto limit=std::chrono::steady_clock::now()+std::chrono::milliseconds(600);
    while(!stopped && std::chrono::steady_clock::now()<limit)std::this_thread::yield();
    const bool cancelled=stopped.load() && callback_done.load();
    pid_t descendant=-1;{std::ifstream in(directory+"/descendant");in>>descendant;}
    if(descendant>1){kill(descendant,SIGKILL);int status;while(waitpid(descendant,&status,0)<0 && errno==EINTR){}}
    stopper.join();
    unlink((directory+"/descendant").c_str());rmdir(directory.c_str());
    return cancelled;
}
static bool accepted_tcp_peer_cancelled()
{
    TCPStream<TestMessage> stream("127.0.0.1",0);
    std::string error;
    if(stream.action_loop(1,error)){std::cerr<<error;return false;}
    // The native listener is the sole listening socket created by this test.
    // Discover its assigned ephemeral port without a close/rebind race.
    int listen_fd=-1; sockaddr_in address{};socklen_t length=sizeof(address);
    for(int fd=3;fd<128;++fd)
    {
        int yes=0;socklen_t size=sizeof(yes);
        if(getsockopt(fd,SOL_SOCKET,SO_ACCEPTCONN,&yes,&size)==0 && yes &&
           getsockname(fd,reinterpret_cast<sockaddr*>(&address),&length)==0)
        {listen_fd=fd;break;}
    }
    if(listen_fd<0){stream.stop();return false;}
    int peer=socket(AF_INET,SOCK_STREAM|SOCK_CLOEXEC,0);
    if(peer<0)return false;
    address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
    if(connect(peer,reinterpret_cast<sockaddr*>(&address),sizeof(address))){close(peer);stream.stop();return false;}
    (void)send(peer,"UNFINISHED",10,0);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    std::atomic<bool> stopped{false};std::thread stopper([&]{stream.stop();stopped=true;});
    auto end=std::chrono::steady_clock::now()+std::chrono::milliseconds(600);
    while(!stopped && std::chrono::steady_clock::now()<end)std::this_thread::yield();
    bool cancelled=stopped.load();shutdown(peer,SHUT_RDWR);close(peer);stopper.join();
    return cancelled;
}
static bool tcp_reset_does_not_retire_listener()
{
    std::atomic<bool> received{false};
    TCPStream<TestMessage> stream("127.0.0.1",0,[&](std::unique_ptr<TestMessage> msg)
    {if(msg->payload=="AFTER_RESET")received=true;});
    std::string error;if(stream.action_loop(1,error))return false;
    sockaddr_in address{};socklen_t length=sizeof(address);bool found=false;
    for(int fd=3;fd<128;++fd)
    {
        int yes=0;socklen_t n=sizeof(yes);
        if(getsockopt(fd,SOL_SOCKET,SO_ACCEPTCONN,&yes,&n)==0 && yes &&
           getsockname(fd,reinterpret_cast<sockaddr*>(&address),&length)==0)
        {found=true;break;}
    }
    if(!found){stream.stop();return false;}
    address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
    int reset=socket(AF_INET,SOCK_STREAM|SOCK_CLOEXEC,0);
    if(connect(reset,reinterpret_cast<sockaddr*>(&address),sizeof(address))){close(reset);stream.stop();return false;}
    (void)send(reset,"INCOMPLETE",10,0);
    std::this_thread::sleep_for(std::chrono::milliseconds(80));
    linger abrupt{1,0};setsockopt(reset,SOL_SOCKET,SO_LINGER,&abrupt,sizeof(abrupt));close(reset);
    std::this_thread::sleep_for(std::chrono::milliseconds(80));
    int peer=socket(AF_INET,SOCK_STREAM|SOCK_CLOEXEC,0);
    if(connect(peer,reinterpret_cast<sockaddr*>(&address),sizeof(address))){close(peer);stream.stop();return false;}
    (void)send(peer,"AFTER_RESET",11,0);shutdown(peer,SHUT_WR);
    auto end=std::chrono::steady_clock::now()+std::chrono::milliseconds(600);
    while(!received && std::chrono::steady_clock::now()<end)std::this_thread::yield();
    close(peer);stream.stop();return received;
}

int main(int argc,char** argv)
{
    if(argc==2)return std::string(argv[1])=="--reader" ? consuming_child() : stalled_child(argv[1]);
    signal(SIGPIPE,SIG_IGN);prctl(PR_SET_CHILD_SUBREAPER,1);
    char path[4096];auto n=readlink("/proc/self/exe",path,sizeof(path)-1);
    if(n<=0)return 2;
    path[n]='\0';
    const bool write_ok=blocked_callback_write_cancelled(path);
    const bool tcp_ok=accepted_tcp_peer_cancelled();
    const bool delivery_ok=complete_serialized_messages(path);
    const bool reset_ok=tcp_reset_does_not_retire_listener();
    std::cout<<(write_ok?"PASS ":"FAIL ")<<"blocked_callback_write_cancelled_with_descendant_reader\n";
    std::cout<<(tcp_ok?"PASS ":"FAIL ")<<"accepted_tcp_peer_cancelled_while_open\n";
    std::cout<<(delivery_ok?"PASS ":"FAIL ")<<"complete_noninterleaved_large_messages_after_partial_writes\n";
    std::cout<<(reset_ok?"PASS ":"FAIL ")<<"listener_survives_connection_reset\n";
    return write_ok&&tcp_ok&&delivery_ok&&reset_ok?0:1;
}
