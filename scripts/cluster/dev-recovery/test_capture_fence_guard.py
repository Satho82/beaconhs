import datetime
import hashlib
from pathlib import Path
import unittest
from unittest.mock import patch

import collect_release_observations as collector

from capture_fence_guard import (validate_bootstrap_env, validate_loaded_proxy,
                                 validate_runtime_coverage)


class CaptureFenceGuardTest(unittest.TestCase):
    def setUp(self):
        self.sha = 'a' * 40
        self.now = 1_700_000_000
        self.expiry = datetime.datetime.fromtimestamp(self.now + 3600,
                                                     datetime.timezone.utc).isoformat()
        self.observer = {'version': 1, 'target': 'https://dev.uvanoo.com', 'wopi': {
            'sourceSha': self.sha, 'epoch': 'b' * 64, 'token': 'x' * 64,
            'expiresAt': self.expiry}}
        self.env = ['APP_VERSION=' + self.sha, 'UVANOO_RECOVERY_SOURCE_SHA=' + self.sha,
                    'UVANOO_RECOVERY_COMPOSE_ID=wYb0LxLQrvj2FPI21i-Oj',
                    'UVANOO_DEV_TELEMETRY_BOOTSTRAP=true',
                    'UVANOO_DEV_TELEMETRY_BOOTSTRAP_EXPIRES_AT=' + self.expiry,
                    'UVANOO_WOPI_OBSERVER_EXPIRES_AT=' + self.expiry,
                    'UVANOO_WOPI_RECOVERY_EPOCH=' + 'b' * 64,
                    'UVANOO_WOPI_OBSERVER_SHA256=' + hashlib.sha256(('x' * 64).encode()).hexdigest()]
        self.route = {'status': 'enabled', 'rule': 'Host(`dev.uvanoo.com`)', 'priority': 20000,
                      'entryPoints': ['websecure'], 'service': 'uvanoo-dev-service',
                      'middlewares': ['capture-deny@file']}
        self.middleware = {'status': 'enabled', 'ipAllowList': {'sourceRange': ['127.0.0.1/32']}}
        self.proxy = {'routers': {'capture@file': self.route},
                      'middlewares': {'capture-deny@file': self.middleware}}

    def test_active_proxy_validated_and_bypass_rejected(self):
        self.assertEqual(len(validate_loaded_proxy(self.proxy, 'capture', 'capture-deny')), 64)
        self.proxy['routers']['save@file'] = {'status': 'enabled', 'priority': 20001,
                                             'entryPoints': ['websecure']}
        with self.assertRaises(ValueError):
            validate_loaded_proxy(self.proxy, 'capture', 'capture-deny')
        del self.proxy['routers']['save@file']
        self.middleware['ipAllowList']['sourceRange'] = ['0.0.0.0/0']
        with self.assertRaises(ValueError):
            validate_loaded_proxy(self.proxy, 'capture', 'capture-deny')

    def test_implicit_entrypoints_cannot_hide_competing_route(self):
        self.proxy['routers']['implicit@file'] = {'status': 'enabled', 'priority': 20001,
                                                 'using': ['websecure'], 'rule': 'Host(`dev.uvanoo.com`)'}
        with self.assertRaises(ValueError):
            validate_loaded_proxy(self.proxy, 'capture', 'capture-deny')

    def test_implicit_priority_uses_rule_length(self):
        self.proxy['routers']['implicit@file'] = {'status': 'enabled', 'priority': 0,
                                                   'entryPoints': ['websecure'],
                                                   'rule': 'x' * 20000}
        with self.assertRaises(ValueError):
            validate_loaded_proxy(self.proxy, 'capture', 'capture-deny')

    def test_rejects_unloaded_and_unqualified_middleware(self):
        self.route['middlewares'] = ['capture-deny']
        with self.assertRaises(ValueError):
            validate_loaded_proxy(self.proxy, 'capture', 'capture-deny')
        self.proxy['routers'].clear()
        with self.assertRaises(KeyError):
            validate_loaded_proxy(self.proxy, 'capture', 'capture-deny')

    def test_environment_is_source_and_observer_bound(self):
        validate_bootstrap_env(self.env, self.observer, self.sha, self.now)
        for env in [self.env[:-1], self.env + ['UVANOO_DEV_TELEMETRY_BOOTSTRAP=false'],
                    [s.replace('BOOTSTRAP=true', 'BOOTSTRAP=false') for s in self.env]]:
            with self.subTest(env=env), self.assertRaises(ValueError):
                validate_bootstrap_env(env, self.observer, self.sha, self.now)
        with self.assertRaises(ValueError):
            validate_bootstrap_env(self.env, self.observer, self.sha, self.now + 3601)

    def test_running_task_and_container_must_match_service(self):
        role = 'web'
        image = 'repo@sha256:' + 'c' * 64
        spec = {'Image': image, 'Env': self.env}
        service = {'Spec': {'Name': 'uvanoo-v1-4-dev-gniriv_web',
                            'Mode': {'Replicated': {'Replicas': 1}},
                            'TaskTemplate': {'ContainerSpec': spec}}}
        task = {'ID': 't1', 'Status': {'State': 'running'}, 'Spec': {'ContainerSpec': spec}}
        container = {'State': {'Running': True}, 'Image': 'sha256:id',
                     'Config': {'Env': self.env, 'Labels': {'com.docker.swarm.task.id': 't1'}}}
        args = (role, service, [task], [container], image, 'sha256:id',
                self.observer, self.sha, self.now)
        validate_runtime_coverage(*args)
        for tasks, containers, image_id in [([task], [], 'sha256:id'),
                                            ([task], [container], 'sha256:wrong'),
                                            ([], [container], 'sha256:id')]:
            with self.subTest(image_id=image_id), self.assertRaises(ValueError):
                validate_runtime_coverage(role, service, tasks, containers, image, image_id,
                                          self.observer, self.sha, self.now)

    def test_collector_pins_loaded_proxy_and_fence(self):
        name = 'uvanoo-dev-capture'
        middleware = 'uvanoo-dev-capture-deny'
        self.proxy['routers'] = {name + '@file': dict(self.route, middlewares=[middleware + '@file'])}
        self.proxy['middlewares'] = {middleware + '@file': self.middleware}
        loaded = validate_loaded_proxy(self.proxy, name, middleware)
        path = '/etc/dokploy/traefik/dynamic/uvanoo-dev-capture.yml'
        payload = b'configured-fence'
        from json import dumps
        import hashlib
        file_hash = hashlib.sha256(payload).hexdigest()
        guard_bytes = Path(__file__).with_name('capture_fence_guard.py').read_bytes()
        config = {'captureGuardSha256': hashlib.sha256(guard_bytes).hexdigest(),
                  'editingFenceHashes': {path: file_hash}, 'captureProxy': {
            'router': name, 'middleware': middleware, 'fencePath': path,
            'fenceSha256': file_hash, 'proxyId': 'proxy1', 'proxyStartedAt': 'start1',
            'loadedConfigSha256': loaded}}
        proxy = {'Id': 'proxy1', 'State': {'Running': True, 'Pid': 123, 'StartedAt': 'start1'}}
        with patch.object(collector.Path, 'read_bytes', side_effect=[guard_bytes, payload, guard_bytes, payload, guard_bytes, payload]), \
             patch.object(collector, 'docker', return_value=[proxy]), \
             patch.object(collector, 'execute', side_effect=lambda *args: dumps(self.proxy).encode()):
            self.assertEqual(collector.capture_proxy(config), loaded)
            config['captureProxy']['loadedConfigSha256'] = '0' * 64
            with self.assertRaises(ValueError):
                collector.capture_proxy(config)
            config['captureProxy']['loadedConfigSha256'] = loaded
            self.proxy['routers']['bypass@file'] = {'status': 'enabled', 'priority': 20001,
                                                    'entryPoints': ['websecure']}
            with self.assertRaises(ValueError):
                collector.capture_proxy(config)

    def test_changed_imported_guard_bytes_rejected(self):
        config = {'captureGuardSha256': '0' * 64}
        with patch.object(collector.Path, 'read_bytes', return_value=b'modified guard'):
            with self.assertRaises(ValueError):
                collector.capture_proxy(config)

    def test_capture_state_changed_during_sample_is_rejected(self):
        config = {'databaseWriteCounters': [], 'databaseOid': 1, 'zeroBaseline': {}}
        with patch.object(collector, 'capture_proxy', side_effect=['a' * 64, 'b' * 64]), \
             patch.object(collector, 'pg_observation', return_value={'stats': [], 'wopiEvents': 0, 'oid': 1}), \
             patch.object(collector, 'current_storage', return_value=(None, {}, {})), \
             patch.object(collector, 'storage_metrics', return_value={'writeCounters': {}, 'writers': 0}), \
             patch.object(collector, 'redis_observation', return_value={'unapprovedClients': 0}), \
             patch.object(collector, 'zero_state', return_value=([], [])), \
             patch.object(collector, 'validate_zero_baseline'):
            with self.assertRaises(ValueError):
                collector.cross_store_sample(config)

    def test_nonterminal_worker_task_is_rejected_even_if_desired_zero(self):
        service = {'Spec': {'Name': 'uvanoo-v1-4-dev-gniriv_worker',
                            'Mode': {'Replicated': {'Replicas': 0}}}}
        with self.assertRaises(ValueError):
            validate_runtime_coverage('worker', service, [{'Status': {'State': 'running'}}],
                                      [], None, None)


if __name__ == '__main__':
    unittest.main()
