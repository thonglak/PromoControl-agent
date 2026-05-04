<?php

namespace App\Commands;

use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

class TestDbConn extends BaseCommand
{
    protected $group       = 'demo';
    protected $name        = 'test:db';
    protected $description = 'ทดสอบการเชื่อมต่อ external DB ผ่าน connection group ที่ระบุ';
    protected $usage       = 'test:db [group] [table]';
    protected $arguments   = [
        'group' => 'connection group (default: db)',
        'table' => 'table name (default: discount_freebies)',
    ];

    public function run(array $params)
    {
        $group = $params[0] ?? 'db';
        $table = $params[1] ?? 'discount_freebies';

        try {
            $db = \Config\Database::connect($group);
            CLI::write("Group: {$group}", 'yellow');
            CLI::write("Host : {$db->hostname}/{$db->database}", 'yellow');

            $total = $db->table($table)->countAll();
            CLI::write("Total rows in {$table}: {$total}", 'green');

            CLI::newLine();
            CLI::write('--- First 3 rows ---', 'cyan');
            $rows = $db->table($table)->limit(3)->get()->getResultArray();
            foreach ($rows as $i => $r) {
                CLI::write('[' . ($i + 1) . '] ' . json_encode($r, JSON_UNESCAPED_UNICODE));
            }
        } catch (\Throwable $e) {
            CLI::error('Error: ' . $e->getMessage());
            return 1;
        }

        return 0;
    }
}
