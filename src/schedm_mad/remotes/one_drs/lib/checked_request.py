"""Opaque native request correlation; never synthesize a nonce from later state."""
from dataclasses import dataclass
import re
import xml.etree.ElementTree as ET


@dataclass(frozen=True)
class CheckedRequest:
    nonce: str
    cluster_id: int
    template_sha256: str


def request_binding(data: bytes) -> CheckedRequest | None:
    root = ET.fromstring(data)
    requests = root.findall("ONE_DRS_REQUEST")
    if not requests:
        return None
    if root.tag != "SCHEDULER_DRIVER_ACTION" or len(requests) != 1:
        raise ValueError("Invalid native checked request envelope")
    request = requests[0]
    fields = {}
    for node in request:
        if node.tag not in {"NONCE", "CLUSTER_ID", "TEMPLATE_SHA256"} or node.tag in fields or len(node):
            raise ValueError("Invalid native checked request fields")
        fields[node.tag] = node.text or ""
    if set(fields) != {"NONCE", "CLUSTER_ID", "TEMPLATE_SHA256"}:
        raise ValueError("Incomplete native checked request")
    if not all(re.fullmatch(r"[0-9a-f]{64}", fields[name]) for name in ["NONCE", "TEMPLATE_SHA256"]):
        raise ValueError("Invalid native checked request identity")
    if not re.fullmatch(r"0|[1-9][0-9]*", fields["CLUSTER_ID"]):
        raise ValueError("Invalid native checked request cluster")
    cid = int(fields["CLUSTER_ID"])
    clusters = [node for node in root.findall("CLUSTER_POOL/CLUSTER") if node.findtext("ID") == str(cid)]
    if len(clusters) != 1 or len(clusters[0].findall("TEMPLATE_SHA256")) != 1 or clusters[0].findtext("TEMPLATE_SHA256") != fields["TEMPLATE_SHA256"]:
        raise ValueError("Native checked request policy differs from scheduler input")
    return CheckedRequest(fields["NONCE"], cid, fields["TEMPLATE_SHA256"])


def error_result(binding: CheckedRequest) -> str:
    root = ET.Element("PLAN")
    for key, value in [("ID", str(binding.cluster_id)), ("TEMPLATE_SHA256", binding.template_sha256),
                       ("REQUEST_NONCE", binding.nonce), ("REQUEST_ERROR", "Native optimizer failed")]:
        ET.SubElement(root, key).text = value
    return ET.tostring(root, encoding="unicode")
