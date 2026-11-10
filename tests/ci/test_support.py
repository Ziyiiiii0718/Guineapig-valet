import unittest
import tempfile
import subprocess
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import support


class Boundaries(unittest.TestCase):
    def test_rejects_hosted_targets_refs_and_credentials_without_echo(self):
        for key in ('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'VERCEL_TOKEN', 'AI_SERVICE_TOKEN', 'PGHOST', 'DOCKER_HOST', 'NODE_OPTIONS'):
            with self.subTest(key=key), self.assertRaises(RuntimeError) as error:
                support.check_environment({key: 'sensitive-test-value'})
            self.assertNotIn('sensitive-test-value', str(error.exception))
        support.check_environment({'CI': 'true', 'PATH': '/usr/bin', 'SUPABASE_ACCESS_TOKEN': ''})

    def test_cleanup_selects_only_generated_resources(self):
        project = 'pv-e2e-' + 'a' * 24
        self.assertTrue(support.owned('container', 'supabase_db_' + project))
        self.assertTrue(support.owned('volume', 'supabase_storage_' + project))
        self.assertTrue(support.owned('network', 'supabase_network_' + project))
        self.assertTrue(support.owned('container', 'piggievault-regression-' + 'b' * 12))
        for kind in support.PATTERNS:
            for name in ('production', 'piggievault-fixture-validation', 'supabase_db_existing', 'supabase_db_' + project + '-other'):
                self.assertFalse(support.owned(kind, name))

    def test_cleanup_refuses_local_and_self_hosted_before_docker(self):
        for env in ({}, {'GITHUB_ACTIONS': 'true', 'RUNNER_ENVIRONMENT': 'self-hosted'}):
            with patch.dict('os.environ', env, clear=True), patch('subprocess.check_output') as docker:
                with self.assertRaises(RuntimeError):
                    support.cleanup()
                docker.assert_not_called()

    def test_cleanup_continues_after_resource_failure_and_erases_private_files(self):
        project = 'pv-e2e-' + 'a' * 24
        def output(command, **kwargs):
            if command == ['docker', 'context', 'inspect']:
                return json.dumps([{'Endpoints': {'docker': {'Host': 'unix:///var/run/docker.sock'}}}]).encode()
            if command[1] == 'ps':
                return 'supabase_db_' + project + '\npiggievault-fixture-validation\n'
            if command[1] == 'volume':
                return 'supabase_storage_' + project + '\n'
            return 'supabase_network_' + project + '\n'
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            private = root / '.local/piggievault-e2e'
            private.mkdir(parents=True)
            (private / 'session.json').write_text('synthetic-test-only')
            with patch.object(support, 'ROOT', root), patch.dict('os.environ', {'GITHUB_ACTIONS': 'true', 'RUNNER_ENVIRONMENT': 'github-hosted'}, clear=True), patch('subprocess.check_output', side_effect=output), patch('subprocess.run', side_effect=[subprocess.TimeoutExpired('docker', 30), SimpleNamespace(returncode=1), SimpleNamespace(returncode=0)]) as remove:
                with self.assertRaises(RuntimeError):
                    support.cleanup()
                self.assertEqual(remove.call_count, 3)
                self.assertFalse(private.exists())
                self.assertNotIn('piggievault-fixture-validation', str(remove.call_args_list))

    def test_artifact_is_bounded_and_discards_all_free_text(self):
        result = support.summary({'CHECK_UNIT': 'success', 'CHECK_BROWSER': 'token=' + 'x' * 10000, 'SECRET': 'private'})
        self.assertEqual(result['unit'], 'success')
        self.assertEqual(result['browser'], 'unavailable')
        self.assertEqual(set(result), set(support.CHECKS))
        self.assertLess(len(str(result)), 2048)
        self.assertNotIn('private', str(result))


if __name__ == '__main__':
    unittest.main()
