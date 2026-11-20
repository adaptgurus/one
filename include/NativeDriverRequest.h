#ifndef NATIVE_DRIVER_REQUEST_H_
#define NATIVE_DRIVER_REQUEST_H_

#include <string>

class VirtualMachine;
class VirtualMachinePool;

// Native history owns this identity. It is never read from a user template.
// Copies into a new history sequence start with the default, empty value.
struct NativeDriverRequestState
{
    std::string token;
    std::string owner;
    std::string operation;
    int state = -1;
    int lcm_state = -1;
    bool pending = false;
};

// A value captured from one MAD response and copied into the LCM queue.
// An empty value is reserved for an internal, pre-dispatch failure/recovery.
struct NativeDriverReply
{
    bool valid = true;
    bool external = false;
    std::string token;
    std::string operation;
    std::string status;
    std::string payload;
};

namespace one_drs_driver
{
const std::string& instance();
bool token_valid(const std::string& value);

// The caller holds the VM lock. Persistence precedes writing the MAD pipe.
// Non-lifecycle TM operations retain the vendor protocol.
bool prepare(VirtualMachine* vm, VirtualMachinePool* pool,
             const std::string& operation, std::string& payload);

NativeDriverReply parse(const std::string& operation,
                        const std::string& status,
                        const std::string& payload, bool legacy = false);

bool matches(const VirtualMachine* vm, const NativeDriverReply& reply);
bool critical_transfer_state(const VirtualMachine* vm);

// Re-check and consume under the same VM lock as the LCM transition. The
// history row is canonical; a failed consume never advances state or a plan.
bool consume(VirtualMachine* vm, VirtualMachinePool* pool,
             const NativeDriverReply& reply, const std::string& family);

// Explicit recovery cannot supersede a request on the current MAD pipe.
// After a daemon restart, only explicit manual reconciliation can retire the
// old instance's ticket. This is not evidence of hypervisor quiescence.
bool manual_recovery(VirtualMachine* vm, VirtualMachinePool* pool,
                     std::string& error);
}

#endif
