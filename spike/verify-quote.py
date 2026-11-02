# Gate 1 check: is the judge's signing key bound to a genuine Intel TDX quote, fresh for our nonce?
# Usage: pip install dcap-qvl==0.7.0, then: python spike/verify-quote.py [model]
import asyncio, hashlib, json, secrets, sys, urllib.parse, urllib.request

import dcap_qvl

MODEL = sys.argv[1] if len(sys.argv) > 1 else 'z-ai/glm-5.3-flash'


def check(name, ok, detail=''):
    print(f"{'PASS' if ok else 'FAIL'} {name}{' (' + detail + ')' if detail else ''}")
    return ok


async def main():
    nonce = secrets.token_hex(32)
    q = urllib.parse.urlencode({'model': MODEL, 'signing_algo': 'ed25519', 'nonce': nonce, 'provider': 'near'})
    req = urllib.request.Request(f'https://cloud-api.near.ai/v1/attestation/report?{q}', headers={'Accept': 'application/json', 'User-Agent': 'secondeyes-spike'})
    report = json.load(urllib.request.urlopen(req, timeout=60))
    found = [a for a in report['model_attestations'] if a['signing_algo'] == 'ed25519']
    ok = check('exactly one ed25519 model candidate', len(found) == 1, f'{len(found)} found')
    a = found[0]
    signer = a['signing_public_key']
    print(f'signer: {signer}')
    ok &= check('model name matches', a['model_name'] == MODEL, a['model_name'])
    ok &= check('report echoes our nonce', a['request_nonce'] == nonce)

    verified = await dcap_qvl.get_collateral_and_verify(bytes.fromhex(a['intel_quote']))
    status = verified.status
    print(f'tcb status: {status}; advisories: {verified.advisory_ids}')
    ok &= check('Intel quote signature and chain verify', True, 'dcap-qvl did not raise')
    ok &= check('TCB is up to date', status == 'UpToDate', status)

    td = json.loads(verified.to_json())['report']['TD10'] if 'TD10' in json.loads(verified.to_json())['report'] else json.loads(verified.to_json())['report']['TD15']['base']
    rd = td['report_data'].lower()
    ok &= check('quote report_data starts with the signing key', rd[:64] == signer.lower(), rd[:64])
    ok &= check('quote report_data ends with our nonce', rd[64:128] == nonce, rd[64:128])

    info = a['info']
    compose = info['tcb_info']['app_compose']
    ok &= check('compose_hash matches app_compose', hashlib.sha256(compose.encode()).hexdigest() == info['compose_hash'])
    print('compose mentions model:', MODEL in compose)
    print('RESULT:', 'all checks passed' if ok else 'one or more checks failed')
    sys.exit(0 if ok else 1)


asyncio.run(main())
