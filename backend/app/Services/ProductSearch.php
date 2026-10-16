<?php

namespace App\Services;

use App\Models\Product;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * The storefront search. A query is split into words and each word is matched against every visible product's name,
 * category, shop and description, forgiving small typos ("mcbook" finds "MacBook", "iphnoe" finds "iPhone"). Products
 * are ranked by how well, and where, the words match: a hit in the name counts most.
 *
 * When some products match every word, only those are returned (so "apple macbook" shows MacBooks, not every Apple
 * product); otherwise the products matching most of the words are. The word list of the catalog is cached for two
 * minutes, which is plenty for a catalog of a few thousand products.
 */
class ProductSearch
{
    private const STOPWORDS = ['the', 'a', 'an', 'and', 'or', 'for', 'with', 'of', 'in', 'on', 'to', 'by', 'ng', 'sa', 'at', 'pcs', 'pc'];

    /**
     * Everyday words shoppers type that the catalog spells differently. A synonym's match counts slightly less than
     * the word itself.
     */
    private const SYNONYMS = [
        'coke' => ['cola', 'coca'], 'softdrink' => ['soda', 'cola', 'sprite', 'royal'], 'softdrinks' => ['soda', 'cola', 'sprite', 'royal'],
        'cellphone' => ['phone', 'smartphone', 'iphone'], 'cp' => ['phone', 'smartphone'], 'mobile' => ['phone', 'smartphone'],
        'earphone' => ['earbuds', 'earphones', 'headphones', 'airpods'], 'earphones' => ['earbuds', 'headphones', 'airpods'], 'headset' => ['headphones', 'earbuds'],
        'perfume' => ['fragrance', 'parfum', 'eau', 'cologne'], 'pabango' => ['fragrance', 'parfum', 'eau', 'cologne'],
        'laptop' => ['macbook', 'notebook', 'chromebook'], 'computer' => ['laptop', 'macbook', 'monitor'],
        'shoes' => ['sneakers', 'trainers', 'footwear', 'heels'], 'tsinelas' => ['slippers', 'sandals'], 'damit' => ['shirt', 'dress', 'top'],
        'bag' => ['handbag', 'backpack', 'wallet'], 'noodles' => ['canton', 'mami', 'ramen', 'batchoy'], 'chips' => ['crisps', 'snack'],
        'makeup' => ['lipstick', 'mascara', 'eyeshadow', 'powder', 'foundation'], 'tv' => ['television', 'monitor'],
    ];

    /** How much a hit counts, by field. */
    private const WEIGHTS = ['name' => 3.0, 'category' => 2.0, 'shop' => 1.5, 'description' => 0.6];


    /** A match at least this good is a real match (exact, prefix, plural, inside a compound); below it is a typo. */
    private const STRONG = 0.7;

    /**
     * @return array{ids: array<int, int>, scores: array<int, float>, corrected: ?string}
     *         ids best match first; corrected is the query as the catalog spells it when a typo was forgiven
     */
    public function search(string $query): array
    {
        $tokens = $this->tokens($query);
        if ($tokens === []) {
            return ['ids' => [], 'scores' => [], 'corrected' => null];
        }

        // Per product and query word: how well it matched (best field) and the weighted score.
        $hits = [];
        $strongSomewhere = [];
        $typoWords = [];
        foreach ($this->index() as $id => $fields) {
            foreach ($tokens as $t => $token) {
                $quality = 0.0;
                $value = 0.0;
                $word = null;
                foreach ($fields as $field => $words) {
                    [$q, $w] = $this->bestMatchWithSynonyms($token, $words);
                    if ($q * self::WEIGHTS[$field] > $value) {
                        $value = $q * self::WEIGHTS[$field];
                        $quality = $q;
                        $word = $w;
                    }
                }
                if ($quality > 0) {
                    $hits[$id][$t] = [$quality, $value];
                    if ($quality >= self::STRONG) {
                        $strongSomewhere[$t] = true;
                    } elseif ($word !== null) {
                        $typoWords[$t][$word] = ($typoWords[$t][$word] ?? 0) + 1;
                    }
                }
            }
        }

        // Tiers, strictest first: every word matched for real; every word matched (typos allowed); half the words
        // for real; half the words. The first tier with any product is the result.
        $n = count($tokens);
        $half = max(1, (int) ceil($n / 2));
        $strong = fn (array $h) => count(array_filter($h, fn ($m) => $m[0] >= self::STRONG));
        $tiers = [
            fn (array $h) => $strong($h) === $n,
            fn (array $h) => count($h) === $n,
            fn (array $h) => $strong($h) >= $half,
            fn (array $h) => count($h) >= $half,
        ];
        $kept = [];
        foreach ($tiers as $tier) {
            $kept = array_filter($hits, $tier);
            if ($kept !== []) {
                break;
            }
        }

        $ranked = array_map(fn (array $h) => [$strong($h), count($h), array_sum(array_column($h, 1))], $kept);
        uasort($ranked, fn ($a, $b) => $b <=> $a);

        // "Showing results for": only words the catalog does not contain at all, replaced by the closest word.
        $corrected = null;
        $words = $tokens;
        foreach ($tokens as $t => $token) {
            if (! isset($strongSomewhere[$t]) && ! empty($typoWords[$t])) {
                arsort($typoWords[$t]);
                $words[$t] = (string) array_key_first($typoWords[$t]);
            }
        }
        if ($words !== $tokens) {
            $corrected = implode(' ', $words);
        }

        return [
            'ids'       => array_keys($ranked),
            'scores'    => array_map(fn ($r) => round($r[2], 2), $ranked),
            'corrected' => $corrected,
        ];
    }

    /**
     * How well a query word matches the best of a field's words: 1 exact, 0.9 a word starting with it, 0.8 it starts
     * with the word (plurals), 0.7 inside a longer compound word, 0.6 a letter or two off (a swap counts as one),
     * 0.5 sounds the same.
     *
     * @param array<int, string> $words
     * @return array{0: float, 1: ?string}
     */
    private function bestMatch(string $token, array $words): array
    {
        $best = 0.0;
        $bestWord = null;
        $len = strlen($token);
        foreach ($words as $word) {
            if ($word === $token) {
                return [1.0, $word];
            }
            $wordLen = strlen($word);
            $quality = 0.0;
            if ($len >= 2 && str_starts_with($word, $token)) {
                $quality = 0.9;
            } elseif ($wordLen >= 3 && str_starts_with($token, $word) && $len - $wordLen <= 2) {
                $quality = 0.8;
            } elseif ($len >= 4 && $wordLen >= $len + 3 && str_contains($word, $token)) {
                $quality = 0.7;
            } elseif ($len >= 4 && abs($wordLen - $len) <= 2 && $token[0] === $word[0]) {
                if ($this->distance($token, $word) <= ($len >= 7 ? 2 : 1)) {
                    $quality = 0.6;
                } elseif ($len >= 5 && metaphone($token) === metaphone($word)) {
                    $quality = 0.5;
                }
            }
            if ($quality > $best) {
                $best = $quality;
                $bestWord = $word;
            }
        }

        return [$best, $bestWord];
    }

    /**
     * The word itself, or one of its synonyms (a little less).
     *
     * @param array<int, string> $words
     * @return array{0: float, 1: ?string}
     */
    private function bestMatchWithSynonyms(string $token, array $words): array
    {
        $best = $this->bestMatch($token, $words);
        if ($best[0] >= 1.0) {
            return $best;
        }
        foreach (self::SYNONYMS[$token] ?? [] as $synonym) {
            [$q] = $this->bestMatch($synonym, $words);
            // Whole words or word starts only ("cola" must not match "chocolate"); never a spelling correction.
            if ($q >= 0.8 && $q * 0.95 > $best[0]) {
                $best = [max(self::STRONG, $q * 0.95), $token];
            }
        }

        return $best;
    }

    /** Edit distance where swapping two neighbouring letters counts as one edit ("iphnoe" is 1 from "iphone"). */
    private function distance(string $a, string $b): int
    {
        $la = strlen($a);
        $lb = strlen($b);
        $d = [];
        for ($i = 0; $i <= $la; $i++) {
            $d[$i][0] = $i;
        }
        for ($j = 0; $j <= $lb; $j++) {
            $d[0][$j] = $j;
        }
        for ($i = 1; $i <= $la; $i++) {
            for ($j = 1; $j <= $lb; $j++) {
                $cost = $a[$i - 1] === $b[$j - 1] ? 0 : 1;
                $d[$i][$j] = min($d[$i - 1][$j] + 1, $d[$i][$j - 1] + 1, $d[$i - 1][$j - 1] + $cost);
                if ($i > 1 && $j > 1 && $a[$i - 1] === $b[$j - 2] && $a[$i - 2] === $b[$j - 1]) {
                    $d[$i][$j] = min($d[$i][$j], $d[$i - 2][$j - 2] + 1);
                }
            }
        }

        return $d[$la][$lb];
    }

    /** @return array<int, string> lowercase words, accents and punctuation removed, stopwords dropped */
    public function tokens(string $text): array
    {
        $text = Str::lower(Str::ascii(strip_tags($text)));
        $words = preg_split('/[^a-z0-9]+/', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return array_values(array_filter($words, fn ($w) => ! in_array($w, self::STOPWORDS, true)));
    }

    /**
     * Every visible product's words, by field.
     *
     * @return array<int, array<string, array<int, string>>>
     */
    private function index(): array
    {
        return Cache::remember('search.product-index.v1', 120, function () {
            $index = [];
            Product::query()
                ->where('status', 'active')
                ->whereHas('seller', fn ($q) => $q->where('status', 'active'))
                ->whereHas('seller.sellerProfile', fn ($q) => $q->where('application_status', 'approved'))
                ->with(['category.parent:id,name', 'category:id,name,parent_id', 'seller.sellerProfile:id,user_id,shop_name'])
                ->select(['id', 'name', 'description', 'category_id', 'seller_id'])
                ->chunkById(500, function ($products) use (&$index) {
                    foreach ($products as $p) {
                        $index[$p->id] = [
                            'name'        => array_values(array_unique($this->tokens($p->name))),
                            'category'    => array_values(array_unique($this->tokens(trim(($p->category?->name ?? '') . ' ' . ($p->category?->parent?->name ?? ''))))),
                            'shop'        => array_values(array_unique($this->tokens($p->seller?->sellerProfile?->shop_name ?? ''))),
                            'description' => array_values(array_unique(array_slice($this->tokens(Str::limit(strip_tags((string) $p->description), 600, '')), 0, 80))),
                        ];
                    }
                });

            return $index;
        });
    }
}
