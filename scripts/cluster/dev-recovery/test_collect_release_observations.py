#!/usr/bin/env python3
"""Failure tests for DEV observation adapters; no service or data mutations."""
import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location("adapter",Path(__file__).with_name("collect_release_observations.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

HEADER="# HELP minio_api_requests_total Total requests\n# TYPE minio_api_requests_total counter\n"
READ='minio_api_requests_total{name="HeadObject",type="s3"} 12\n'

class Observations(unittest.TestCase):
    def rejected(self,call):
        with self.assertRaises((ValueError,KeyError,TypeError)):call()

    def test_pinned_metrics_omitted_zero(self):
        self.assertEqual(m.parse_storage_metrics(HEADER+READ),{})
    def test_write_counter_preserved(self):
        self.assertEqual(m.parse_storage_metrics(HEADER+READ+'minio_api_requests_total{name="PutObject",type="s3"} 2\n'),{"PutObject":2})
    def test_active_writer_rejected(self):
        self.rejected(lambda:m.parse_storage_metrics(HEADER+READ+'minio_api_requests_inflight_total{name="PutObject",type="s3"} 1\n'))
    def test_known_read_inflight_allowed(self):
        self.assertEqual(m.parse_storage_metrics(HEADER+READ+'minio_api_requests_inflight_total{name="HeadObject",type="s3"} 1\n'),{})
    def test_waiting_request_rejected(self):
        self.rejected(lambda:m.parse_storage_metrics(HEADER+READ+'minio_api_requests_waiting_total{type="s3"} 1\n'))
    def test_unknown_active_api_rejected(self):
        self.rejected(lambda:m.parse_storage_metrics(HEADER+READ+'minio_api_requests_inflight_total{name="UnknownAPI",type="s3"} 1\n'))
    def test_empty_metrics_rejected(self):
        self.rejected(lambda:m.parse_storage_metrics(""))
    def test_headers_only_rejected(self):
        self.rejected(lambda:m.parse_storage_metrics(HEADER))
    def test_truncated_metrics_rejected(self):
        self.rejected(lambda:m.parse_storage_metrics((HEADER+READ).rstrip()))
    def test_missing_type_rejected(self):
        self.rejected(lambda:m.parse_storage_metrics(READ))
    def test_duplicate_metrics_rejected(self):
        self.rejected(lambda:m.parse_storage_metrics(HEADER+READ+READ))
    def test_nan_metrics_rejected(self):
        self.rejected(lambda:m.parse_storage_metrics(HEADER+READ+'minio_api_requests_inflight_total{name="PutObject",type="s3"} NaN\n'))
    def test_negative_metrics_rejected(self):
        self.rejected(lambda:m.parse_storage_metrics(HEADER+READ+'minio_api_requests_inflight_total{name="PutObject",type="s3"} -1\n'))
    def test_wrong_metric_scope_rejected(self):
        self.rejected(lambda:m.parse_storage_metrics(HEADER+READ.replace('type="s3"','type="other"')))
    def test_unapproved_pg_client_rejected(self):
        value={"oid":1,"clients":[{"user":"uvanoo_dev","address":None,"state":"active","query":"UPDATE tenants SET name=name"}],"stats":[],"wopiEvents":0}
        with patch.object(m,"execute",return_value=json.dumps(value).encode()):
            self.rejected(m.pg_observation)
    def test_idle_pg_client_rejected(self):
        value={"oid":1,"clients":[{"user":"uvanoo_dev","address":None,"state":"idle","query":"BEGIN READ ONLY; SET LOCAL statement_timeout=1500; SELECT count(*) FROM audit_log WHERE entity_type='wopi_save_dev_v1'; ROLLBACK;"}],"stats":[],"wopiEvents":0}
        with patch.object(m,"execute",return_value=json.dumps(value).encode()):
            self.rejected(m.pg_observation)
    def test_exact_readonly_sampler_client(self):
        value={"oid":1,"clients":[{"user":"uvanoo_dev","address":None,"state":"active","query":"BEGIN READ ONLY; SET LOCAL statement_timeout=1500; SELECT count(*) FROM audit_log WHERE entity_type='wopi_save_dev_v1'; ROLLBACK;"}],"stats":[],"wopiEvents":0}
        with patch.object(m,"execute",return_value=json.dumps(value).encode()):
            self.assertEqual(m.pg_observation()["clients"],0)
    def test_sql_prefix_not_trusted(self):
        value={"oid":1,"clients":[{"user":"uvanoo_dev","address":None,"state":"active","query":"BEGIN READ ONLY; SET LOCAL statement_timeout=1500; SELECT count(*) FROM audit_log WHERE entity_type='wopi_save_dev_v1'; ROLLBACK; DELETE FROM tenants;"}],"stats":[],"wopiEvents":0}
        with patch.object(m,"execute",return_value=json.dumps(value).encode()):
            self.rejected(m.pg_observation)
    def test_source_identity_mismatch_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"config";p.write_text("{}");p.chmod(0o600)
            self.rejected(lambda:m.private_json(p,"0"*64))
    def test_public_private_file_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"config";p.write_text("{}");p.chmod(0o644)
            self.rejected(lambda:m.private_json(p))
    def test_symlink_private_file_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"config";p.write_text("{}");p.chmod(0o600)
            q=Path(d)/"link";q.symlink_to(p)
            self.rejected(lambda:m.private_json(q))
    def test_spec_change_rejected(self):
        s=[{"ID":"one","Spec":{"Name":"dev","value":1}}]
        b={"serviceIds":{"dev":"one"},"serviceSpecHashes":{"one":m.digest(m.canonical(s[0]["Spec"]))},"taskIds":[]}
        m.validate_zero_baseline(s,[],b)
        s[0]["Spec"]["value"]=2
        self.rejected(lambda:m.validate_zero_baseline(s,[],b))
    def test_replacement_task_rejected(self):
        s=[{"ID":"one","Spec":{"Name":"dev"}}]
        b={"serviceIds":{"dev":"one"},"serviceSpecHashes":{"one":m.digest(m.canonical(s[0]["Spec"]))},"taskIds":["old"]}
        self.rejected(lambda:m.validate_zero_baseline(s,[{"ID":"new"}],b))

class Intervals(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=Path(self.tmp.name)/"samples"
        self.config={"sourceSha":"a"*40,"epoch":"b"*64,"zeroBaseline":{},"databaseWriteCounters":[1,2,3],"minioWriteCounters":{},"storageBaseline":{"sha256":"c"*64},"crossStoreContinuationPath":str(self.path),"collectorSha256":m.digest(Path(m.__file__).read_bytes()),"samplerSha256":m.digest(Path(m.__file__).with_name("sample_release_interval.py").read_bytes())}
        now=time.time()
        self.samples=[]
        for n in range(31):
            at=dt.datetime.fromtimestamp(now-60+2*n,dt.timezone.utc).isoformat()
            self.samples.append({"sourceSha":"a"*40,"epoch":"b"*64,"collectorSha256":self.config["collectorSha256"],"samplerSha256":self.config["samplerSha256"],"configSha256":m.interval_config_identity(self.config),"startedAt":at,"observedAt":at,"status":"OK","zeroBaselineSha256":m.digest(m.canonical({})),"databaseWriteCounters":[1,2,3],"storageWriteCounters":{},"storageBaselineSha256":"c"*64,"wopiEvents":0,"unapprovedPostgresClients":0,"unapprovedRedisClients":0,"storageWriters":0,"inventorySha256":"d"*64})
    def tearDown(self):self.tmp.cleanup()
    def run_check(self):
        self.path.write_text("".join(json.dumps(x)+"\n" for x in self.samples))
        self.path.chmod(0o600)
        return m.verified_cross_store_interval(self.config)
    def reject(self):
        with self.assertRaises((ValueError,KeyError)):self.run_check()
    def test_complete_interval(self):self.assertEqual(len(self.run_check()),31)
    def test_gap(self):del self.samples[8:12];self.reject()
    def test_stale(self):self.samples=self.samples[:-4];self.reject()
    def test_short(self):self.samples=self.samples[4:];self.reject()
    def test_wrong_source(self):self.samples[8]["sourceSha"]="e"*40;self.reject()
    def test_wrong_epoch(self):self.samples[8]["epoch"]="e"*64;self.reject()
    def test_wrong_spec(self):self.samples[8]["zeroBaselineSha256"]="e"*64;self.reject()
    def test_database_write(self):self.samples[8]["databaseWriteCounters"]=[1,2,4];self.reject()
    def test_storage_write(self):self.samples[8]["storageWriteCounters"]={"PutObject":1};self.reject()
    def test_redis_client(self):self.samples[8]["unapprovedRedisClients"]=1;self.reject()
    def test_pg_client(self):self.samples[8]["unapprovedPostgresClients"]=1;self.reject()
    def test_new_save(self):self.samples[8]["wopiEvents"]=1;self.reject()
    def test_inventory_change(self):self.samples[8]["inventorySha256"]="e"*64;self.reject()
    def test_changed_producer_config(self):self.samples[8]["configSha256"]="e"*64;self.reject()
    def test_changed_producer_code(self):self.samples[8]["collectorSha256"]="e"*64;self.reject()
    def test_changed_sampler_code(self):self.samples[8]["samplerSha256"]="e"*64;self.reject()
    def test_missing_observation(self):del self.samples[8]["storageWriters"];self.reject()

class Boundaries(unittest.TestCase):
    def test_only_expected_volume_consumer(self):
        with tempfile.TemporaryDirectory() as directory:
            volume=Path(directory)/"volume";volume.mkdir()
            m.require_volume_consumers([{"Name":"/uvanoo-dev-minio","Mounts":[{"Type":"volume","Name":"uvanoo-dev-minio-data","Source":str(volume)}]}],str(volume))
    def test_parent_bind_consumer_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            volume=Path(directory)/"volume";volume.mkdir()
            consumers=[{"Name":"/uvanoo-dev-minio","Mounts":[{"Type":"volume","Name":"uvanoo-dev-minio-data","Source":str(volume)}]},{"Name":"/unapproved","Mounts":[{"Type":"bind","Source":directory}]}]
            with self.assertRaises(ValueError):m.require_volume_consumers(consumers,str(volume))
    def test_subdirectory_bind_consumer_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            volume=Path(directory)/"volume";volume.mkdir();child=volume/"child";child.mkdir()
            consumers=[{"Name":"/uvanoo-dev-minio","Mounts":[{"Type":"volume","Name":"uvanoo-dev-minio-data","Source":str(volume)}]},{"Name":"/unapproved","Mounts":[{"Type":"bind","Source":str(child)}]}]
            with self.assertRaises(ValueError):m.require_volume_consumers(consumers,str(volume))
    def test_public_stream_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/"samples";p.write_text("{}\n");p.chmod(0o644)
            with self.assertRaises(ValueError):m.private_stream(p)
    def test_symlink_stream_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/"samples";p.write_text("{}\n");p.chmod(0o600)
            q=Path(directory)/"link";q.symlink_to(p)
            with self.assertRaises(ValueError):m.private_stream(q)
    def stop_fixture(self):
        at="2026-10-30T09:01:06+00:00"
        return {"containerId":"container","taskId":"task","exitCode":"143","stoppedAt":at},[{"Action":"die","Actor":{"ID":"container","Attributes":{"exitCode":"143","com.docker.swarm.task.id":"task"}},"timeNano":int(m.timestamp(at)*1e9)}],{"stopRequestedAt":"2026-10-30T09:01:02+00:00"}
    def test_exact_stop_event(self):
        boundary,events,bootstrap=self.stop_fixture()
        m.validate_stop_event(boundary,json.dumps(events[0]).encode(),bootstrap)
    def test_wrong_task_stop_rejected(self):
        boundary,events,bootstrap=self.stop_fixture();events[0]["Actor"]["Attributes"]["com.docker.swarm.task.id"]="other"
        with self.assertRaises(ValueError):m.validate_stop_event(boundary,json.dumps(events[0]).encode(),bootstrap)
    def test_wrong_stop_time_rejected(self):
        boundary,events,bootstrap=self.stop_fixture();events[0]["timeNano"]+=10_000_000
        with self.assertRaises(ValueError):m.validate_stop_event(boundary,json.dumps(events[0]).encode(),bootstrap)
    def test_oom_stop_rejected(self):
        boundary,events,bootstrap=self.stop_fixture();events.append({"Action":"oom","Actor":{"ID":"container"}})
        with self.assertRaises(ValueError):m.validate_stop_event(boundary,b"\n".join(json.dumps(x).encode() for x in events),bootstrap)

if __name__=="__main__":unittest.main()
