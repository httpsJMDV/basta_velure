<?php

namespace App\Services\Catalog;

use App\Models\Category;

/**
 * Decides whether a listing must wait for an admin before it goes live, whether or not the AI product check is on.
 *
 * Loved-IT sells no medicine of any kind (prescription or over the counter, anything injected) and no vitamins or food
 * supplements; first-aid items and medical devices (band-aids, thermometers, BP monitors) are fine. A keyword cannot
 * tell those apart for sure ("Vitamin C serum" is skincare), so a match holds the listing for a person to decide
 * instead of refusing it. Everything filed under "Others" is held too, since nothing else describes what it is.
 */
class ListingScreen
{
    /**
     * Words that suggest medicine, vitamins or supplements, matched as whole words in the name and description. Generic
     * words like "tablet", "capsule" or "syrup" are left out on purpose (an iPad, coffee pods, pancake syrup); a dose
     * such as "500 mg" catches those listings instead.
     */
    public const MEDICINE_WORDS = [
        // Medicine in general, in English and Filipino
        'medicine', 'medicines', 'medication', 'medications', 'gamot', 'prescription', 'antibiotic', 'antibiotics',
        'injection', 'injections', 'injectable', 'injectables', 'ampoule', 'ampoules', 'ampule', 'ampules', 'iv drip',
        // Vitamins and supplements
        'vitamin', 'vitamins', 'multivitamin', 'multivitamins', 'supplement', 'supplements', 'glutathione',
        'ascorbic acid', 'sodium ascorbate', 'fish oil', 'omega-3', 'probiotic', 'probiotics',
        // Common medicines and brands sold in the Philippines
        'paracetamol', 'acetaminophen', 'biogesic', 'tempra', 'calpol', 'neozep', 'bioflu', 'decolgen', 'alaxan',
        'medicol', 'advil', 'ibuprofen', 'mefenamic', 'ponstan', 'dolfenal', 'aspirin', 'amoxicillin', 'cefalexin',
        'cephalexin', 'azithromycin', 'cetirizine', 'loratadine', 'losartan', 'amlodipine', 'metformin', 'solmux',
        'ambroxol', 'carbocisteine', 'kremil-s', 'diatabs', 'loperamide', 'imodium', 'buscopan', 'tuseran',
        'robitussin', 'salbutamol', 'ventolin', 'insulin', 'enervon', 'conzace', 'stresstabs', 'centrum', 'fern-c',
        'poten-cee', 'ceelin', 'propan', 'myra e',
    ];

    /**
     * Why a person must look at this listing before buyers can see it, or null when it may go live.
     */
    public function holdReason(?Category $category, ?string $name, ?string $description): ?string
    {
        $reasons = [];
        if ($category?->isUnderOthers()) {
            $reasons[] = 'Filed under Others, so an admin checks what it is';
        }
        if ($words = $this->medicineWords(trim(($name ?? '') . ' ' . ($description ?? '')))) {
            $reasons[] = 'Mentions ' . implode(', ', array_map(fn ($w) => "\"{$w}\"", $words))
                . '. Loved-IT does not sell medicine, vitamins or supplements';
        }

        return $reasons ? implode('. ', $reasons) . '.' : null;
    }

    /**
     * The medicine words (and doses like "500mg") found in a text, lowercased, without repeats, at most five.
     *
     * @return array<int, string>
     */
    public function medicineWords(string $text): array
    {
        $plain = mb_strtolower(html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5));
        if ($plain === '') {
            return [];
        }

        $found = [];
        $pattern = '/(?<![\p{L}\p{N}])(' . implode('|', array_map(fn ($w) => preg_quote($w, '/'), self::MEDICINE_WORDS)) . ')(?![\p{L}\p{N}])/u';
        if (preg_match_all($pattern, $plain, $m)) {
            $found = $m[1];
        }
        // A dose: "500mg", "250 mg", "10 mcg".
        if (preg_match_all('/(?<![\p{L}\p{N}.])(\d+(?:\.\d+)?\s?(?:mg|mcg))(?![\p{L}\p{N}])/u', $plain, $d)) {
            $found = array_merge($found, $d[1]);
        }

        return array_slice(array_values(array_unique($found)), 0, 5);
    }
}
