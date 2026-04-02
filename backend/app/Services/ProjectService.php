<?php

namespace App\Services;

use App\Models\NumberSeriesModel;

/**
 * ProjectService — business logic สำหรับจัดการโครงการ
 * Business rule: เมื่อสร้างโครงการใหม่ ต้อง initDefaultNumberSeries() ทันที
 *
 * NOTE: initDefaultNumberSeries() ยังคงไว้สำหรับ backward compatibility
 * แต่ระบบใหม่ใช้ NumberSeriesService::createDefaultSeries() แทน
 */
class ProjectService
{
    // ค่า default สำหรับ number series แต่ละ document type
    public const DEFAULT_NUMBER_SERIES = [
        [
            'document_type'  => 'SALE',
            'prefix'         => 'SO',
            'separator'      => '-',
            'year_format'    => 'YYYY_BE',
            'year_separator' => '-',
            'running_digits' => 4,
            'reset_cycle'    => 'YEARLY',
        ],
        [
            'document_type'  => 'BUDGET_MOVE',
            'prefix'         => 'BM',
            'separator'      => '-',
            'year_format'    => 'YYYY_BE',
            'year_separator' => '-',
            'running_digits' => 4,
            'reset_cycle'    => 'YEARLY',
        ],
        [
            'document_type'  => 'BOTTOM_LINE',
            'prefix'         => 'BL',
            'separator'      => '-',
            'year_format'    => 'YYYY_BE',
            'year_separator' => '-',
            'running_digits' => 4,
            'reset_cycle'    => 'YEARLY',
        ],
        [
            'document_type'  => 'UNIT_ALLOC',
            'prefix'         => 'UA',
            'separator'      => '-',
            'year_format'    => 'YYYY_BE',
            'year_separator' => '-',
            'running_digits' => 4,
            'reset_cycle'    => 'YEARLY',
        ],
    ];

    /**
     * สร้าง default number series 4 รายการสำหรับโครงการใหม่
     * เรียกทันทีหลัง INSERT project — ห้ามข้ามขั้นตอนนี้
     *
     * @deprecated ใช้ NumberSeriesService::createDefaultSeries() แทน
     */
    public function initDefaultNumberSeries(int $projectId, ?int $createdBy = null): void
    {
        $numberSeriesService = new NumberSeriesService();
        $numberSeriesService->createDefaultSeries($projectId);
    }

    /**
     * คำนวณตัวอย่างเลขที่จาก config (ใช้วันปัจจุบัน)
     * ตัวอย่าง: SO + '-' + 2569 + '-' + '0001' = "SO-2569-0001"
     */
    public function calculateSampleOutput(array $config, int $nextNumber = 1): string
    {
        $adYear = (int) date('Y');
        $beYear = $adYear + 543;

        $yearPart = match ($config['year_format']) {
            'YYYY_BE' => (string) $beYear,
            'YYYY_AD' => (string) $adYear,
            'YY_BE'   => substr((string) $beYear, -2),
            'YY_AD'   => substr((string) $adYear, -2),
            'NONE'    => '',
            default   => (string) $beYear,
        };

        $runningPart = str_pad((string) $nextNumber, $config['running_digits'], '0', STR_PAD_LEFT);

        $result = $config['prefix'] . $config['separator'] . $yearPart;
        if ($yearPart !== '') {
            $result .= $config['year_separator'];
        }
        $result .= $runningPart;

        return $result;
    }
}
