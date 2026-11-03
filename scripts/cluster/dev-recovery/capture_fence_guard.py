"""Read-only validators for the DEV capture fence and bootstrap task coverage.

This module never changes Traefik, starts services or authorizes a release. Callers
must obtain fresh local control-plane observations and fail closed on any error.
"""
import datetime
import hashlib
import json
import re

DEV_HOST = 'https://dev.uvanoo.com'
DEV_COMPOSE = 'wYb0LxLQrvj2FPI21i-Oj'
TERMINAL = frozenset({'complete', 'shutdown', 'failed', 'rejected', 'remove'})


def require(condition):
    if not condition:
        raise ValueError('DEV_CAPTURE_OBSERVATION_INVALID')


def validate_loaded_proxy(data, router_name, middleware_name, priority=20000):
    """Reject unloaded, bypassed or partially loaded DEV capture routing."""
    routers = data['routers']
    middlewares = data['middlewares']
    route = routers[router_name + '@file']
    middleware = middlewares[middleware_name + '@file']
    require(route['status'] == 'enabled')
    require(route['rule'] == 'Host(`dev.uvanoo.com`)')
    require(route['priority'] == priority and priority >= 20000)
    require(route['entryPoints'] == ['websecure'])
    require(route['service'] == 'uvanoo-dev-service')
    require(route['middlewares'] == [middleware_name + '@file'])
    require(middleware['status'] == 'enabled')
    require(middleware['ipAllowList']['sourceRange'] == ['127.0.0.1/32'])
    # The capture phase does not admit an existing-save exception. Reject all
    # competing secure routers at equal or greater priority, even unrelated ones.
    for name, candidate in routers.items():
        if name != router_name + '@file' and candidate.get('status') == 'enabled':
            if 'websecure' in candidate.get('entryPoints', []):
                # Traefik's implicit priority is the rule length when priority
                # is absent or zero; never treat an implicit rule as priority 0.
                effective = candidate.get('priority', 0)
                require(type(effective) is int and effective >= 0)
                if effective == 0:
                    rule = candidate['rule']
                    require(isinstance(rule, str))
                    effective = len(rule)
                require(effective < priority)
    normalized = json.dumps({'router': route, 'middleware': middleware}, sort_keys=True,
                            separators=(',', ':')).encode()
    return hashlib.sha256(normalized).hexdigest()


def validate_bootstrap_env(env, observer, source_sha, now):
    """Match actual task/container env to the authenticated observer binding."""
    require(re.fullmatch(r'[0-9a-f]{40}', source_sha) is not None)
    require(observer['version'] == 1 and observer['target'] == DEV_HOST)
    wopi = observer['wopi']
    require(wopi['sourceSha'] == source_sha)
    require(re.fullmatch(r'[0-9a-f]{64}', wopi['epoch']) is not None)
    require(re.fullmatch(r'[A-Za-z0-9_-]{64}', wopi['token']) is not None)
    expires = datetime.datetime.fromisoformat(wopi['expiresAt'].replace('Z', '+00:00')).timestamp()
    require(now < expires <= now + 7200)
    expected = {
        'APP_VERSION': source_sha,
        'UVANOO_RECOVERY_SOURCE_SHA': source_sha,
        'UVANOO_RECOVERY_COMPOSE_ID': DEV_COMPOSE,
        'UVANOO_DEV_TELEMETRY_BOOTSTRAP': 'true',
        'UVANOO_DEV_TELEMETRY_BOOTSTRAP_EXPIRES_AT': wopi['expiresAt'],
        'UVANOO_WOPI_OBSERVER_SHA256': hashlib.sha256(wopi['token'].encode()).hexdigest(),
        'UVANOO_WOPI_OBSERVER_EXPIRES_AT': wopi['expiresAt'],
        'UVANOO_WOPI_RECOVERY_EPOCH': wopi['epoch'],
    }
    for key, value in expected.items():
        require([entry for entry in env if entry.startswith(key + '=')] == [key + '=' + value])


def validate_runtime_coverage(role, service, tasks, containers, image_ref, image_id,
                              observer=None, source_sha=None, now=None):
    """Compare service intent, every nonterminal task, and running containers.

    This basic validator intentionally fails closed during shutdown convergence;
    callers must not use it to infer a separately verified stopping interval.
    """
    require(role in {'web', 'collabora', 'worker', 'scheduler', 'storage-init'})
    spec = service['Spec']
    require(spec['Name'] == 'uvanoo-v1-4-dev-gniriv_' + role)
    desired = spec['Mode']['Replicated']['Replicas']
    require(type(desired) is int and desired in ([0, 1] if role in {'web', 'collabora'} else [0]))
    active = [task for task in tasks if task['Status']['State'] not in TERMINAL]
    require(len(active) <= desired)
    if role not in {'web', 'collabora'}:
        require(not active and not containers)
        return
    if desired:
        require(spec['TaskTemplate']['ContainerSpec']['Image'] == image_ref)
        if role == 'web':
            validate_bootstrap_env(spec['TaskTemplate']['ContainerSpec']['Env'], observer,
                                   source_sha, now)
    task_ids = set()
    running_ids = set()
    for task in active:
        task_id = task['ID']
        require(task_id not in task_ids)
        task_ids.add(task_id)
        task_spec = task['Spec']['ContainerSpec']
        require(task_spec['Image'] == image_ref)
        if role == 'web':
            validate_bootstrap_env(task_spec['Env'], observer, source_sha, now)
        if task['Status']['State'] == 'running':
            running_ids.add(task_id)
    seen = set()
    for container in containers:
        require(container['State']['Running'] is True and container['Image'] == image_id)
        task_id = container['Config']['Labels']['com.docker.swarm.task.id']
        require(task_id in task_ids and task_id not in seen)
        seen.add(task_id)
        if role == 'web':
            validate_bootstrap_env(container['Config']['Env'], observer, source_sha, now)
    require(seen == running_ids and len(containers) <= desired)


def main():
    """Validate a freshly collected Traefik rawdata document from standard input."""
    import sys
    try:
        require(len(sys.argv) == 3)
        router, middleware = sys.argv[1:]
        require(re.fullmatch(r'uvanoo-dev-[a-z0-9-]+', router) is not None)
        require(re.fullmatch(r'uvanoo-dev-[a-z0-9-]+', middleware) is not None)
        raw = sys.stdin.buffer.read(4_000_001)
        require(len(raw) <= 4_000_000)
        print(validate_loaded_proxy(json.loads(raw), router, middleware))
    except Exception:
        print('DEV_CAPTURE_OBSERVATION_INVALID', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
