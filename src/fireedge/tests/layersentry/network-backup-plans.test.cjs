/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems               *
 *                                                                           *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may  *
 * not use this file except in compliance with the License. You may obtain   *
 * a copy of the License at                                                  *
 *                                                                           *
 * http://www.apache.org/licenses/LICENSE-2.0                                *
 *                                                                           *
 * Unless required by applicable law or agreed to in writing, software       *
 * distributed under the License is distributed on an "AS IS" BASIS,        *
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  *
 * See the License for the specific language governing permissions and       *
 * limitations under the License.                                            *
 * ------------------------------------------------------------------------- */
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const Module = require("node:module");
const babel = require("@babel/core");

const fireedgeRoot = resolve(__dirname, "../..");
const read = (relative) =>
  readFileSync(resolve(fireedgeRoot, relative), "utf8");

const loadEsm = (relative, stubs = {}) => {
  const file = resolve(fireedgeRoot, relative);
  const { code } = babel.transformSync(readFileSync(file, "utf8"), {
    babelrc: false,
    configFile: false,
    presets: [
      [
        require.resolve("@babel/preset-env"),
        { targets: { node: "current" }, modules: "commonjs" },
      ],
    ],
  });
  const compiled = new Module(file, module);
  compiled.filename = file;
  compiled.paths = Module._nodeModulePaths(dirname(file));
  const originalLoad = Module._load;
  Module._load = (request, parent, isMain) =>
    Object.prototype.hasOwnProperty.call(stubs, request)
      ? stubs[request]
      : originalLoad(request, parent, isMain);
  try {
    compiled._compile(code, file);
  } finally {
    Module._load = originalLoad;
  }

  return compiled.exports;
};

const cidr = loadEsm(
  "src/modules/resources/VirtualNetwork/Forms/CreateForm/cidr.js"
);
const network = loadEsm("src/client/apps/layersentry/networkPlan.js", {
  "../../../modules/resources/VirtualNetwork/Forms/CreateForm/cidr": cidr,
});
const backup = loadEsm("src/client/apps/layersentry/backupPlan.js");

test("network plan compiles customer segment fields to native VNet attributes", () => {
  const draft = {
    ...network.defaultNetworkDraft(),
    environment: "prod",
    tier: "db",
    name: "prod_db_network",
    cidr: "10.42.7.15/24",
    gateway: "10.42.7.1",
    firstIp: "10.42.7.20",
    size: "40",
    vlanId: "321",
    securityGroups: "8, 9,8",
    policy: "TIERED",
    advanced: true,
    driver: "802.1Q",
    uplink: "bond0",
    mtu: "9000",
  };
  assert.deepEqual(network.validateNetworkDraft(draft), {});
  const template = network.compileNetworkTemplate(draft);
  assert.equal(template.NETWORK_ADDRESS, "10.42.7.0");
  assert.equal(template.NETWORK_MASK, "255.255.255.0");
  assert.equal(template.VLAN_ID, "321");
  assert.equal(template.SECURITY_GROUPS, "8,9");
  assert.equal(template.LAYERSENTRY_ENVIRONMENT, "PROD");
  assert.equal(template.LAYERSENTRY_TIER, "DB");
  assert.equal(template.LAYERSENTRY_ISOLATION_POLICY, "TIERED");
  assert.equal(template.AR.IP, "10.42.7.20");
  assert.equal(template.AR.SIZE, 40);
  assert.equal(template.VN_MAD, "802.1Q");
  assert.equal(template.PHYDEV, "bond0");
  assert.equal(template.FILTER_MAC_SPOOFING, "YES");
  assert.equal(template.FILTER_IP_SPOOFING, "YES");
});

test("network plan validates isolation enforcement and native readback", () => {
  const draft = network.defaultNetworkDraft();
  assert.match(network.validateNetworkDraft(draft).securityGroups, /enforces/);
  draft.securityGroups = "12";
  const expected = network.compileNetworkTemplate(draft);
  assert.equal(
    network.networkReadbackMatches(
      {
        NAME: expected.NAME,
        TEMPLATE: { ...expected, SECURITY_GROUPS: `0,${expected.SECURITY_GROUPS}` },
        AR_POOL: { AR: expected.AR },
      },
      expected
    ),
    true
  );
});

test("network validation fails closed for CIDR, DNS and VLAN driver gaps", () => {
  const outside = {
    ...network.defaultNetworkDraft(),
    securityGroups: "12",
    gateway: "10.21.0.1",
    firstIp: "10.20.1.10",
    dns: "10.20.0.2,not-an-ip",
    vlanId: "212",
  };
  const errors = network.validateNetworkDraft(outside);
  assert.match(errors.gateway, /inside this CIDR/);
  assert.match(errors.firstIp, /inside this CIDR/);
  assert.match(errors.dns, /valid IPv4/);
  assert.match(errors.uplink, /physical uplink/);

  const overflow = {
    ...network.defaultNetworkDraft(),
    securityGroups: "12",
    firstIp: "10.20.0.250",
    size: "10",
  };
  assert.match(network.validateNetworkDraft(overflow).size, /fit inside/);
});

test("backup profiles compile schedule retention destination and VM assignment", () => {
  for (const id of ["ESSENTIAL", "BUSINESS", "CRITICAL"]) {
    const draft = {
      ...backup.defaultBackupPlanDraft(),
      name: `${id} plan`,
      profile: id,
      vmIds: ["41", "42"],
      datastoreId: "100",
    };
    assert.deepEqual(backup.validateBackupPlanDraft(draft), {});
    const template = backup.compileBackupPlanTemplate(draft);
    const profile = backup.BACKUP_PLAN_PROFILES[id];
    assert.equal(template.LAYERSENTRY_PLAN, id);
    assert.equal(template.BACKUP_VMS, "41,42");
    assert.equal(template.DATASTORE_ID, "100");
    assert.equal(template.KEEP_LAST, profile.keepLast);
    assert.equal(template.SCHED_ACTION.DAYS, profile.intervalHours);
    assert.equal(template.SCHED_ACTION.ACTION, "backup");
    assert.ok(template.PRIORITY <= 49);
  }
});

test("custom backup plan and authoritative readback fail closed", () => {
  const draft = {
    ...backup.defaultBackupPlanDraft(),
    name: "Custom database protection",
    profile: "CUSTOM",
    vmIds: ["51"],
    datastoreId: "100",
    keepLast: "45",
    intervalHours: "6",
    advanced: true,
    fsFreeze: "SUSPEND",
  };
  const expected = backup.compileBackupPlanTemplate(draft);
  assert.equal(expected.KEEP_LAST, 45);
  assert.equal(expected.SCHED_ACTION.DAYS, 6);
  assert.equal(expected.FS_FREEZE, "SUSPEND");
  assert.equal(
    backup.backupPlanReadbackMatches(
      {
        NAME: expected.NAME,
        PRIORITY: expected.PRIORITY,
        TEMPLATE: {
          ...expected,
          SCHED_ACTION: { ...expected.SCHED_ACTION, PERIODIC: undefined },
        },
      },
      expected
    ),
    true
  );
  assert.equal(
    backup.backupPlanReadbackMatches(
      { NAME: expected.NAME, TEMPLATE: { ...expected, KEEP_LAST: 1 } },
      expected
    ),
    false
  );
  assert.equal(
    backup.backupPlanReadbackMatches(
      {
        NAME: expected.NAME,
        PRIORITY: expected.PRIORITY,
        TEMPLATE: {
          ...expected,
          SCHED_ACTION: { ...expected.SCHED_ACTION, DAYS: 12 },
        },
      },
      expected
    ),
    false
  );
});

test("portal uses dedicated RBAC-gated Network and Backup Plan flows", () => {
  const portal = read("src/client/apps/layersentry/Portal.js");
  const capabilities = read("src/client/apps/layersentry/capabilities.js");
  const protection = read(
    "src/client/apps/layersentry/pages/ProtectionWorkspace.js"
  );

  assert.match(
    portal,
    /path="\/network\/create"\s+component={NetworkCreateWizard}/
  );
  assert.match(
    portal,
    /path="\/protection\/create"\s+component={BackupPlanCreateWizard}/
  );
  assert.match(capabilities, /CAPABILITY_IDS\.NETWORK_CREATE/);
  assert.match(capabilities, /CAPABILITY_IDS\.BACKUP_RECOVERY_CREATE/);
  assert.match(protection, /useRetryBackupJobMutation/);
  assert.match(protection, /useRestoreBackupMutation/);
  assert.match(protection, /timestamp \* 1000/);
});
