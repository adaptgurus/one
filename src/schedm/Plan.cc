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

#include "Plan.h"
#include "NebulaLog.h"
#include "OneDB.h"
#include "NebulaUtil.h"
#include <openssl/rand.h>
#include <algorithm>

using namespace std;

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

int PlanAction::from_xml_node(const xmlNodePtr node, int hint_id)
{
    Template tmpl;
    int tmp_int;

    tmpl.from_xml_node(node);

    if (!tmpl.get("ID", _id))
    {
        _id = hint_id;
    }

    auto rc = tmpl.get("VM_ID", _vm_id);
    rc &= tmpl.get("OPERATION", _operation);
    rc &= tmpl.get("HOST_ID", _host_id);
    rc &= tmpl.get("DS_ID", _ds_id);

    tmpl.get("ELIGIBILITY_SHA256", _eligibility_sha256);
    if (!_eligibility_sha256.empty() && (_eligibility_sha256.size() != 64 ||
        !std::all_of(_eligibility_sha256.begin(), _eligibility_sha256.end(), [](unsigned char c)
        { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); }))) return -1;

    tmpl.get("TIMESTAMP", _timestamp);

    tmpl.get("STATE", tmp_int);
    _state = static_cast<PlanState>(tmp_int);

    vector<VectorAttribute *> nics;
    tmpl.get("NIC", nics);

    for (auto nic : nics)
    {
        int nic_id     = -1;
        int network_id = -1;

        nic->vector_value("NIC_ID", nic_id);
        nic->vector_value("NETWORK_ID", network_id);

        _nics.emplace_back(nic_id, network_id);
    }

    if (!rc)
    {
        NebulaLog::error("PLM", "Unable to create PlanAction from xml");
        return -1;
    }

    return 0;
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

std::string PlanAction::to_xml() const
{
    ostringstream oss;

    oss << "<ACTION>"
        << "<ID>"         << _id         << "</ID>"
        << "<VM_ID>"      << _vm_id      << "</VM_ID>"
        << "<STATE>"      << _state      << "</STATE>"
        << "<OPERATION>"  << _operation  << "</OPERATION>"
        << "<HOST_ID>"    << _host_id    << "</HOST_ID>"
        << "<DS_ID>"      << _ds_id      << "</DS_ID>"
        << "<ELIGIBILITY_SHA256>" << _eligibility_sha256 << "</ELIGIBILITY_SHA256>"
        << "<TIMESTAMP>"  << _timestamp  << "</TIMESTAMP>";

    for (const auto& nic : _nics)
    {
        oss << "<NIC>"
            << "<NIC_ID>"     << nic.first  << "</NIC_ID>"
            << "<NETWORK_ID>" << nic.second << "</NETWORK_ID>"
            << "</NIC>";
    }

    oss << "</ACTION>";

    return oss.str();
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

PlanAction* Plan::get_next_action()
{
    for (auto& action : _actions)
    {
        if (action.state() == PlanState::READY)
        {
            return &action;
        }
    }

    return nullptr;
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

bool Plan::action_finished(int id, PlanState state)
{
    for (auto& action : _actions)
    {
        if (action.id() == id && ( action.state() == PlanState::APPLYING ||
                action.state() == PlanState::TIMEOUT))
        {
            action.state(state);

            return true;
        }
    }

    return false;
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

std::string OneDRSPlanRequest::to_xml() const
{
    if (!present()) return "";
    std::ostringstream out;
    out << "<REQUEST><NONCE>" << nonce << "</NONCE>"
        << "<ACTION>" << action << "</ACTION><STATE>" << state << "</STATE>"
        << "<TEMPLATE_SHA256>" << template_sha256 << "</TEMPLATE_SHA256>"
        << "<BASE_PLAN_SHA256>" << base_plan_sha256 << "</BASE_PLAN_SHA256>"
        << "<PLAN_GENERATION>" << plan_generation << "</PLAN_GENERATION>"
        << "<ERROR>" << one_util::escape_xml(error) << "</ERROR>"
        << "<INSTANCE>" << instance << "</INSTANCE><STARTED_AT>" << started_at
        << "</STARTED_AT></REQUEST>";
    return out.str();
}

void Plan::begin_generate(const std::string& nonce, const std::string& policy,
                         const std::string& base, const std::string& instance)
{
    clear();
    _generation.clear();
    _template_sha256 = policy;
    _request = {nonce, "GENERATE", "GENERATING", policy, base, "", "", instance,
                static_cast<long long>(time(nullptr))};
}

bool Plan::accept_generated(const Plan& response)
{
    if (!generating() || response.response_nonce() != _request.nonce ||
        response.template_sha256() != _request.template_sha256) return false;
    if (!renew_generation()) return false;
    _actions = response._actions;
    _state = _actions.empty() ? PlanState::NONE : PlanState::READY;
    _request.state = _actions.empty() ? "NOOP" : "READY";
    _request.plan_generation = _generation;
    _request.error.clear();
    return true;
}

void Plan::generation_error(const std::string& reason)
{
    if (!generating()) return;
    _actions.clear();
    _state = PlanState::NONE;
    _checked_execution = false;
    _generation.clear();
    _request.state = "ERROR";
    _request.error = reason.substr(0, 512);
    _request.plan_generation.clear();
}

void Plan::reject_ready(const std::string& nonce, const std::string& policy,
                       const std::string& base, const std::string& instance)
{
    const auto rejected = _generation;
    clear();
    _request = {nonce, "REJECT", "REJECTED", policy, base, rejected, "", instance,
                static_cast<long long>(time(nullptr))};
}

string Plan::to_xml() const
{
    ostringstream oss;

    oss << "<PLAN>"
        << "<ID>"    << _cid << "</ID>"
        << "<STATE>" << _state << "</STATE>"
        << "<CHECKED_EXECUTION>" << _checked_execution << "</CHECKED_EXECUTION>"
        << "<GENERATION>" << _generation << "</GENERATION>"
        << "<TEMPLATE_SHA256>" << _template_sha256 << "</TEMPLATE_SHA256>";

    for (const auto& action : _actions)
    {
        oss << action.to_xml();
    }

    oss << _request.to_xml() << "</PLAN>";

    return oss.str();
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

std::string Plan::sha256() const
{
    return one_util::sha256_digest(to_xml());
}

bool Plan::renew_generation()
{
    unsigned char nonce[32];
    if (RAND_bytes(nonce, sizeof(nonce)) != 1) return false;
    _checked_execution = false;
    _generation = one_util::sha256_digest(std::string(
        reinterpret_cast<const char*>(nonce), sizeof(nonce)));
    return true;
}

int Plan::validate_checked(const std::string& expected_sha256, std::string& error) const
{
    if (generating())
    {
        error = "Native recommendation generation is in progress";
        return -1;
    }
    if (_state != PlanState::READY)
    {
        error = "Approved plan is no longer READY";
        return -1;
    }
    if (_generation.empty())
    {
        error = "Plan predates checked execution; generate a new plan";
        return -1;
    }
    if (_actions.empty() || std::any_of(_actions.begin(), _actions.end(), [](const PlanAction& action)
        { return action.operation() != "migrate" || action.state() != PlanState::READY ||
                 action.vm_id() < 0 || action.host_id() < 0 || action.eligibility_sha256().empty(); }))
    {
        error = "Checked OneDRS execution requires only READY migration actions";
        return -1;
    }
    if (expected_sha256 != sha256())
    {
        error = "Plan identity changed; refresh and approve the current plan";
        return -1;
    }
    return 0;
}

int Plan::start_checked(const std::string& expected_sha256, std::string& error)
{
    if (validate_checked(expected_sha256, error) != 0) return -1;
    _checked_execution = true;
    _state = PlanState::APPLYING;
    return 0;
}

int Plan::from_xml(const std::string& xml)
{
    if (update_from_str(xml) != 0)
    {
        return -1;
    }

    return rebuild_attributes();
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void Plan::check_completed()
{
    auto new_state = PlanState::DONE;

    for (const auto& a : _actions)
    {
        if (a.state() == PlanState::READY ||
            a.state() == PlanState::APPLYING)
        {
            return;
        }

        if (new_state == PlanState::ERROR)
        {
            continue;
        }

        if (a.state() == PlanState::ERROR)
        {
            new_state = PlanState::ERROR;
        }
        else if (a.state() == PlanState::TIMEOUT)
        {
            new_state = PlanState::TIMEOUT;
        }
    }

    // Plan is completed, set new state
    _state = new_state;
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void Plan::timeout_actions(int timeout)
{
    auto now = time(nullptr);

    for (auto& a : _actions)
    {
        if (a.state() == PlanState::APPLYING &&
            a.timestamp() + timeout < now)
        {
            a.state(PlanState::TIMEOUT);
        }
    }
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void Plan::count_actions(int &cluster_actions, std::map<int, int>& host_actions)
{
    for (const auto& a : _actions)
    {
        if (a.state() == PlanState::APPLYING)
        {
            host_actions[a.host_id()]++;
            cluster_actions++;
        }
    }
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

int Plan::rebuild_attributes()
{
    int tmp_int;
    int rc = 0;

    rc += xpath(_cid, "/PLAN/ID", -1);
    xpath(tmp_int, "/PLAN/STATE", -1); // State can be empty

    _state = static_cast<PlanState>(tmp_int);
    int checked = 0;
    xpath(checked, "/PLAN/CHECKED_EXECUTION", 0);
    if (checked != 0 && checked != 1) return -1;
    _checked_execution = checked == 1;
    xpath(_generation, "/PLAN/GENERATION", "");
    xpath(_template_sha256, "/PLAN/TEMPLATE_SHA256", "");
    if (!_template_sha256.empty() && (_template_sha256.size() != 64 ||
        !std::all_of(_template_sha256.begin(), _template_sha256.end(), [](unsigned char c)
        { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); })))
    {
        return -1;
    }
    if (!_generation.empty() && (_generation.size() != 64 ||
        !std::all_of(_generation.begin(), _generation.end(), [](unsigned char c)
        { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); })))
    {
        return -1;
    }

    const auto valid_digest = [](const std::string& value)
    {
        return value.size() == 64 && std::all_of(value.begin(), value.end(),
            [](unsigned char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); });
    };
    const auto scalar = [this](const std::string& path, std::string& value, bool required)
    {
        std::vector<xmlNodePtr> nodes;
        get_nodes(path, nodes);
        const bool good = nodes.size() == (required ? 1U : 0U) || (!required && nodes.size() == 1);
        ObjectXML::free_nodes(nodes);
        if (!good) return false;
        xpath(value, path.c_str(), "");
        return true;
    };
    _request = {};
    std::vector<xmlNodePtr> requests;
    get_nodes("/PLAN/REQUEST", requests);
    const auto request_count = requests.size();
    ObjectXML::free_nodes(requests);
    if (request_count > 1) return -1;
    if (request_count == 1)
    {
        for (const auto& pair : std::vector<std::pair<const char*, std::string*>>
            {{"NONCE", &_request.nonce}, {"ACTION", &_request.action},
             {"STATE", &_request.state}, {"TEMPLATE_SHA256", &_request.template_sha256},
             {"BASE_PLAN_SHA256", &_request.base_plan_sha256},
             {"PLAN_GENERATION", &_request.plan_generation}, {"ERROR", &_request.error},
             {"INSTANCE", &_request.instance}})
        {
            if (!scalar(std::string("/PLAN/REQUEST/") + pair.first, *pair.second, true)) return -1;
        }
        std::string started;
        if (!scalar("/PLAN/REQUEST/STARTED_AT", started, true) || started.empty() ||
            started.find_first_not_of("0123456789") != std::string::npos) return -1;
        try { _request.started_at = std::stoll(started); } catch (...) { return -1; }
        if (!valid_digest(_request.nonce) || !valid_digest(_request.template_sha256) ||
            !valid_digest(_request.instance) || _request.started_at <= 0 ||
            (!_request.base_plan_sha256.empty() && !valid_digest(_request.base_plan_sha256)) ||
            (!_request.plan_generation.empty() && !valid_digest(_request.plan_generation)) ||
            _request.error.size() > 512) return -1;
        if (_request.action == "GENERATE")
        {
            if (_request.state != "GENERATING" && _request.state != "READY" &&
                _request.state != "NOOP" && _request.state != "ERROR") return -1;
        }
        else if (_request.action == "REJECT")
        {
            if (_request.state != "REJECTED" && _request.state != "ERROR") return -1;
        }
        else return -1;
    }
    if (!scalar("/PLAN/REQUEST_NONCE", _response_nonce, false) ||
        !scalar("/PLAN/REQUEST_ERROR", _response_error, false) ||
        (!_response_nonce.empty() && !valid_digest(_response_nonce)) ||
        _response_error.size() > 512 || (!_response_error.empty() && _response_nonce.empty())) return -1;

    vector<xmlNodePtr> action_nodes;

    ObjectXML::get_nodes("/PLAN/ACTION", action_nodes);

    _actions.clear();

    int id = -1;
    for (auto node : action_nodes)
    {
        PlanAction action;
        rc += action.from_xml_node(node, ++id);

        if (rc != 0)
        {
            break;
        }

        _actions.emplace_back(action);
    }

    if (rc != 0)
    {
        NebulaLog::error("PLM", "Unable to create Plan from xml");

        _state = PlanState::ERROR;

        return -1;
    }

    return 0;
}

int Plan::bootstrap(SqlDB * db)
{
    std::ostringstream oss;

    oss.str(one_db::plan_db_bootstrap);

    return db->exec_local_wr(oss);
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

int Plan::select_cb(void *nil, int num, char **values, char **names)
{
    if ( (!values[0]) || (num != 1) )
    {
        return -1;
    }

    return from_xml(values[0]);
}

/* -------------------------------------------------------------------------- */

int Plan::select(SqlDB * db)
{
    ostringstream oss;

    set_callback(static_cast<Callbackable::Callback>(&Plan::select_cb));

    oss << "SELECT body FROM " << one_db::plan_table
        << " WHERE cid = " << _cid;

    // Store id to check if the object is in the DB
    int tmp_id = _cid;
    _cid = -2;

    int rc = db->exec_rd(oss, this);

    unset_callback();

    if ((rc != 0) || (_cid != tmp_id ))
    {
        return -1;
    }

    return rc;
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

int Plan::insert_replace(SqlDB *db, bool replace)
{
    ostringstream   oss;

    char * sql_body = db->escape_str(to_xml());

    if (!sql_body)
    {
        return -1;
    }

    if(replace)
    {
        oss << "UPDATE " << one_db::plan_table << " SET "
            << "cid = "       << _cid      << ", "
            << "state = "     << _state    << ", "
            << "body =  '"    << sql_body << "' "
            << "WHERE cid = " << _cid;
    }
    else
    {
        oss << "INSERT INTO " << one_db::plan_table
            << " (" << one_db::plan_db_names << ") VALUES ("
            <<        _cid     << ","
            <<        _state   << ","
            << "'" << sql_body << "')";
    }

    int rc = db->exec_wr(oss);

    db->free_str(sql_body);

    return rc;
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

int Plan::drop(SqlDB * db)
{
    ostringstream   oss;
    oss << "DELETE FROM " << one_db::plan_table << " WHERE cid=" << _cid;
    return db->exec_wr(oss);
}

