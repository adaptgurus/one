#include "NativeDriverRequest.h"
#include "VirtualMachine.h"
#include "VirtualMachinePool.h"

#include <openssl/rand.h>
#include <sstream>

namespace
{
const std::string prefix = "ONE_DRS_REQUEST=";

std::string random_token()
{
    unsigned char bytes[32];
    if (RAND_bytes(bytes, sizeof(bytes)) != 1) return {};
    static const char digits[] = "0123456789abcdef";
    std::string value;
    value.reserve(64);
    for (auto byte : bytes)
    {
        value.push_back(digits[byte >> 4]);
        value.push_back(digits[byte & 15]);
    }
    return value;
}

std::string operation_family(const VirtualMachine* vm, const std::string& op)
{
    using VM = VirtualMachine;
    const auto state = vm->get_lcm_state();
    if (vm->get_state() != VM::ACTIVE) return {};

    if (op == "MIGRATE") return state == VM::MIGRATE ? "DEPLOY" : "";
    if (op == "DEPLOY" || op == "RESTORE")
    {
        switch (state)
        {
            case VM::BOOT: case VM::BOOT_POWEROFF: case VM::BOOT_UNKNOWN:
            case VM::BOOT_SUSPENDED: case VM::BOOT_STOPPED:
            case VM::BOOT_UNDEPLOY: case VM::BOOT_MIGRATE:
                return "DEPLOY";
            default: return {};
        }
    }
    if (op == "SAVE")
    {
        switch (state)
        {
            case VM::SAVE_MIGRATE: case VM::SAVE_SUSPEND: case VM::SAVE_STOP:
                return "SAVE";
            default: return {};
        }
    }
    if (op == "SHUTDOWN" || op == "CANCEL")
    {
        switch (state)
        {
            case VM::SHUTDOWN: case VM::SHUTDOWN_POWEROFF:
            case VM::SHUTDOWN_UNDEPLOY: case VM::SAVE_MIGRATE:
                return "SHUTDOWN";
            default: return {};
        }
    }
    if (op == "CLEANUP") return state == VM::CLEANUP_RESUBMIT ? "CLEANUP" : "";
    if (op == "TRANSFER")
    {
        switch (state)
        {
            case VM::PROLOG: case VM::PROLOG_MIGRATE: case VM::PROLOG_RESUME:
            case VM::PROLOG_UNDEPLOY: case VM::PROLOG_MIGRATE_POWEROFF:
            case VM::PROLOG_MIGRATE_SUSPEND: case VM::PROLOG_MIGRATE_UNKNOWN:
                return "PROLOG";
            case VM::EPILOG: case VM::EPILOG_STOP: case VM::EPILOG_UNDEPLOY:
            case VM::CLEANUP_RESUBMIT:
                return "EPILOG";
            default: return {};
        }
    }
    return {};
}
}

namespace one_drs_driver
{
const std::string& instance()
{
    static const std::string value = random_token();
    return value;
}

bool token_valid(const std::string& value)
{
    return value.size() == 64 &&
           value.find_first_not_of("0123456789abcdef") == std::string::npos;
}

bool critical_transfer_state(const VirtualMachine* vm)
{
    return !operation_family(vm, "TRANSFER").empty();
}

bool prepare(VirtualMachine* vm, VirtualMachinePool* pool,
             const std::string& operation, std::string& payload)
{
    if (!vm || !vm->hasHistory()) return false;
    if (operation_family(vm, operation).empty())
    {
        // Vendor background disk transfers and post-delete cleanup have no
        // OneDRS lifecycle callback. They cannot replace an outstanding ticket.
        if (!vm->driver_request_pending() &&
            (operation == "TRANSFER" ||
             (operation == "CLEANUP" &&
              (vm->get_lcm_state() == VirtualMachine::CLEANUP_DELETE ||
               vm->get_state() == VirtualMachine::DONE)))) return true;
        vm->log("VMM", Log::ERROR, "Refusing driver dispatch outside its native lifecycle state");
        return false;
    }
    if (vm->driver_request_pending() || vm->capacity_admission_pending())
    {
        vm->log("VMM", Log::ERROR, "Refusing to replace an unresolved native driver request");
        return false;
    }
    NativeDriverRequestState request;
    request.token = random_token();
    request.owner = instance();
    request.operation = operation;
    request.state = vm->get_state();
    request.lcm_state = vm->get_lcm_state();
    request.pending = true;
    if (!token_valid(request.token) || !token_valid(request.owner))
    {
        vm->log("VMM", Log::ERROR, "Cannot generate native driver request identity");
        return false;
    }
    vm->driver_request(request);
    if (pool->update_history(vm) != 0 || pool->update(vm) != 0)
    {
        vm->log("VMM", Log::ERROR, "Native driver request persistence is unresolved; no dispatch");
        return false;
    }
    payload = prefix + request.token + " " + payload;
    return true;
}

NativeDriverReply parse(const std::string& operation,
                        const std::string& status,
                        const std::string& payload, bool legacy)
{
    NativeDriverReply reply;
    reply.operation = operation;
    reply.status = status;
    reply.payload = payload;
    reply.valid = status == "SUCCESS" || status == "FAILURE";
    if (payload.compare(0, prefix.size(), prefix) != 0)
    {
        reply.valid = reply.valid && legacy;
        return reply;
    }
    reply.external = true;
    const auto end = payload.find(' ');
    if (end != prefix.size() + 64)
    {
        reply.valid = false;
        return reply;
    }
    reply.token = payload.substr(prefix.size(), 64);
    reply.payload = payload.substr(end + 1);
    reply.valid = reply.valid && token_valid(reply.token) &&
                  reply.payload.compare(0, prefix.size(), prefix) != 0;
    return reply;
}

bool matches(const VirtualMachine* vm, const NativeDriverReply& reply)
{
    if (!vm || !vm->hasHistory() || !reply.valid || !reply.external) return false;
    const auto& request = vm->driver_request();
    return request.pending && token_valid(reply.token) &&
           request.token == reply.token && request.owner == instance() &&
           request.operation == reply.operation &&
           request.state == vm->get_state() && request.lcm_state == vm->get_lcm_state() &&
           !vm->capacity_admission_pending() &&
           !operation_family(vm, reply.operation).empty();
}

bool consume(VirtualMachine* vm, VirtualMachinePool* pool,
             const NativeDriverReply& reply, const std::string& family)
{
    if (!reply.external)
    {
        if (reply.valid && !vm->driver_request_pending()) return true;
        vm->log("LCM", Log::WARNING, "Internal callback cannot supersede an unresolved driver request");
        return false;
    }
    if (!matches(vm, reply) || operation_family(vm, reply.operation) != family)
    {
        vm->log("LCM", Log::WARNING, "Ignoring stale, duplicate, or wrong-state native driver reply");
        return false;
    }
    std::string deploy_id;
    if (reply.operation == "DEPLOY" && reply.status == "SUCCESS")
    {
        std::istringstream input(reply.payload);
        input >> deploy_id;
        if (deploy_id.empty() || deploy_id == "-")
        {
            vm->log("LCM", Log::WARNING, "Ignoring malformed native deployment acknowledgement");
            return false;
        }
    }
    auto request = vm->driver_request();
    request.pending = false;
    vm->driver_request(request);
    // The canonical history row is the consume point. Keep the token as a
    // tombstone. Never re-derive a reply identity from the current VM history.
    if (pool->update_history(vm) != 0)
    {
        request.pending = true;
        vm->driver_request(request);
        vm->log("LCM", Log::ERROR, "Native driver reply consumption is unresolved");
        return false;
    }

    bool changed = false;
    if (reply.operation == "DEPLOY" && reply.status == "SUCCESS")
    {
        vm->set_deploy_id(deploy_id);
        changed = true;
    }
    if (reply.status == "FAILURE")
    {
        const auto error = "Error executing " + reply.operation + ": " + reply.payload;
        vm->set_template_error_message(error);
        vm->log("LCM", Log::ERROR, error);
        changed = true;
    }
    if (changed && pool->update(vm) != 0)
    {
        vm->log("LCM", Log::ERROR, "Cannot persist native driver reply result");
        return false;
    }
    return true;
}

bool manual_recovery(VirtualMachine* vm, VirtualMachinePool* pool,
                     std::string& error)
{
    if (!vm->driver_request_pending()) return true;
    auto request = vm->driver_request();
    if (request.owner == instance())
    {
        error = "Native driver request is still outstanding; recovery cannot supersede its reply";
        return false;
    }
    request.pending = false;
    vm->driver_request(request);
    if (pool->update_history(vm) != 0 || pool->update(vm) != 0)
    {
        error = "Cannot persist explicit reconciliation of the previous daemon's driver request";
        return false;
    }
    vm->log("LCM", Log::WARNING, "Explicit recovery retired a previous daemon's driver ticket; operator reconciliation is required");
    return true;
}
}
