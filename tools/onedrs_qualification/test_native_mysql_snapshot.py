import unittest
from native_mysql_snapshot import database_config, option, parse_rows


class NativeMysqlSnapshotTests(unittest.TestCase):
    def config(self, credentials='USER="native", PASSWD="literal,#$value"'):
        return '# DB=[BACKEND="ignored"]\nDB=[ BACKEND="mysql", SERVER="localhost", PORT=0, DB_NAME="opennebula", '+credentials+' ]\n'

    def transaction(self):
        body='<VM><NAME>Unicode café\nsecond line</NAME></VM>'
        return '\n'.join([
            'META\t10.5.29-MariaDB\tnative-node\t1\tREPEATABLE-READ\t1',
            'WSREP_BEGIN\tWSREP_READY\tOFF',
            'ENGINE\thistory\tInnoDB', 'ENGINE\tplan_pool\tInnoDB', 'ENGINE\tvm_pool\tInnoDB',
            'COUNTS\t1\t0\t0', 'VM\t42\t3\t3\t'+body.encode().hex(),
            'WSREP_END\tWSREP_READY\tOFF', 'COMPLETE\t1',
        ])+'\n'

    def test_quoted_credentials_preserve_literal_punctuation(self):
        self.assertEqual(database_config(self.config())['PASSWD'],'literal,#$value')
        self.assertEqual(option('a"b\\c'),'"a\\"b\\\\c"')

    def test_ambiguous_or_remote_config_is_rejected(self):
        for source in [self.config()+'DB=[BACKEND="mysql"]',self.config('USER="a", USER="b", PASSWD="v"'),self.config().replace('localhost','other-host'),self.config().replace('PORT=0','PORT=65536'),self.config().replace('BACKEND="mysql"','BACKEND="sqlite"')]:
            with self.subTest(source_kind='invalid configuration'):
                with self.assertRaises(ValueError):database_config(source)

    def test_native_string_escapes_are_preserved(self):
        cfg=database_config(self.config('USER="native", PASSWD="quote\\\"and\\\\slash"'))
        self.assertEqual(cfg['PASSWD'],'quote"and\\slash')

    def test_hex_preserves_exact_utf8_and_newlines(self):
        result=parse_rows(self.transaction())
        self.assertEqual(result['vm_rows'][0],[42,3,3,'<VM><NAME>Unicode café\nsecond line</NAME></VM>'])
        self.assertTrue(result['transaction']['read_only'])
        self.assertTrue(result['transaction']['consistent_snapshot'])

    def test_incomplete_nontransactional_and_writable_inputs_are_rejected(self):
        text=self.transaction()
        for bad in [text.replace('COMPLETE\t1\n',''),text.replace('REPEATABLE-READ','READ-COMMITTED'),text.replace('REPEATABLE-READ\t1','REPEATABLE-READ\t0'),text.replace('vm_pool\tInnoDB','vm_pool\tMyISAM'),text.replace('COUNTS\t1\t0\t0','COUNTS\t2\t0\t0'),text+'COMPLETE\t1\n',text.replace('native-node\t1','native-node\t1\textra')]:
            with self.subTest(transaction_kind='invalid boundary'):
                with self.assertRaises(ValueError):parse_rows(bad)

    def test_duplicate_engine_and_unexpected_records_are_rejected(self):
        for bad in [self.transaction().replace('COUNTS\t','ENGINE\thistory\tInnoDB\nCOUNTS\t'),self.transaction().replace('COMPLETE\t1','UNKNOWN\t1\nCOMPLETE\t1')]:
            with self.assertRaises(ValueError):parse_rows(bad)


if __name__=='__main__':unittest.main()
