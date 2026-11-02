#!/usr/bin/env python3
"""Exact DEV Redis mount and shared-healthcheck identity failure tests."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location("inventory",Path(__file__).with_name("release_object_inventory.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class RedisMounts(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.addCleanup(self.directory.cleanup)
        self.root=Path(self.directory.name).resolve()
        self.lock=self.root/"observer.lock";self.lock.touch(mode=0o600)
        self.data=self.root/"data";self.data.mkdir()
        self.info=SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_uid=0,st_dev=7,st_ino=11)
        self.volume={'Name':m.REDIS_VOLUME,'Driver':'local','Scope':'local','Mountpoint':str(self.data)}
        self.item={'Config':{'Healthcheck':{'Test':m.REDIS_HEALTHCHECK}},'Mounts':[
            {'Type':'volume','Name':m.REDIS_VOLUME,'Source':str(self.data),'Destination':'/data','RW':True},
            {'Type':'bind','Source':str(self.lock),'Destination':m.REDIS_LOCK_TARGET,'RW':True}]}
        self.mounted=b'7:11\n'
        def run(args):
            if args[:3]==['docker','volume','inspect']:return json.dumps([self.volume]).encode()
            self.assertEqual(args,['docker','exec','uvanoo-dev-redis','stat','-Lc','%d:%i',m.REDIS_LOCK_TARGET])
            return self.mounted
        for mocked in [patch.object(m,'REDIS_LOCK',self.lock),patch.object(m,'run',side_effect=run),
                       patch.object(m.os,'open',return_value=123),patch.object(m.os,'close'),
                       patch.object(m.os,'fstat',return_value=self.info),patch.object(Path,'lstat',return_value=self.info)]:
            mocked.start();self.addCleanup(mocked.stop)

    def reject(self,item):
        with self.assertRaises((ValueError,FileNotFoundError)):m.redis_mounts(item)

    def test_exact_mounts_and_bound_inode_accepted(self):
        m.redis_mounts(self.item)
        m.os.open.assert_called_once_with(self.lock,os.O_RDONLY|os.O_NOFOLLOW)

    def test_missing_extra_duplicate_mounts_rejected(self):
        for mounts in [[],self.item['Mounts'][:1],self.item['Mounts']+[self.item['Mounts'][0]],
                       [self.item['Mounts'][0],self.item['Mounts'][0]]]:
            with self.subTest(mount_count=len(mounts)):
                item=copy.deepcopy(self.item);item['Mounts']=mounts;self.reject(item)

    def test_volume_mount_mismatches_rejected(self):
        for key,value in [('Type','bind'),('Name','other'),('Source',str(self.root)),
                          ('Destination','/elsewhere'),('RW',False),('SubPath','other')]:
            with self.subTest(field=key):
                item=copy.deepcopy(self.item);item['Mounts'][0][key]=value;self.reject(item)

    def test_lock_mount_mismatches_rejected(self):
        for key,value in [('Type','volume'),('Source',str(self.root/'other')),
                          ('Destination','/elsewhere'),('RW',False)]:
            with self.subTest(field=key):
                item=copy.deepcopy(self.item);item['Mounts'][1][key]=value;self.reject(item)

    def test_volume_identity_mismatches_rejected(self):
        for key,value in [('Name','other'),('Driver','remote'),('Scope','global'),('Options',{'type':'nfs','device':'remote:/data'}),
                          ('Mountpoint',str(self.root)),('Mountpoint',str(self.root/'missing'))]:
            with self.subTest(field=key):
                before=copy.deepcopy(self.volume);self.volume[key]=value;self.reject(self.item);self.volume=before

    def test_volume_mountpoint_must_be_directory(self):
        self.volume['Mountpoint']=str(self.lock)
        self.item['Mounts'][0]['Source']=str(self.lock)
        self.reject(self.item)

    def test_missing_volume_rejected(self):
        with patch.object(m,'run',return_value=b'[]'):self.reject(self.item)

    def test_healthcheck_must_share_exact_lock(self):
        for health in [None,['CMD-SHELL','redis-cli ping'],['CMD-SHELL',m.REDIS_HEALTHCHECK[1].replace('flock -w 1','flock -w 30')]]:
            item=copy.deepcopy(self.item);item['Config']['Healthcheck']['Test']=health;self.reject(item)

    def test_private_regular_root_lock_required(self):
        for field,value in [('st_uid',1000),('st_mode',stat.S_IFREG|0o644),('st_mode',stat.S_IFDIR|0o600)]:
            with self.subTest(field=field,value=value):
                before=getattr(self.info,field);setattr(self.info,field,value);self.reject(self.item);setattr(self.info,field,before)

    def test_symlink_lock_rejected(self):
        link=self.root/'link';link.symlink_to(self.lock)
        item=copy.deepcopy(self.item);item['Mounts'][1]['Source']=str(link)
        with patch.object(m,'REDIS_LOCK',link):self.reject(item)

    def test_bound_inode_replacement_rejected(self):
        self.mounted=b'7:12\n';self.reject(self.item)

    def test_path_inode_replacement_during_check_rejected(self):
        other=SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_uid=0,st_dev=7,st_ino=12)
        with patch.object(Path,'lstat',side_effect=[self.info,other]):self.reject(self.item)

if __name__=='__main__':unittest.main()
