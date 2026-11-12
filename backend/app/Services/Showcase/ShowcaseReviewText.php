<?php

namespace App\Services\Showcase;

/**
 * What showcase buyers write: product reviews that fit the star rating and the kind of product, the shop's replies,
 * and comments about shops. Written the way Filipino shoppers write them, in English and Taglish.
 */
final class ShowcaseReviewText
{
    private const BY_RATING = [
        5 => [
            'Legit seller! Item arrived complete and well packed.',
            'Super bilis ng delivery, 2 days lang. Highly recommended!',
            'Exactly as described. Will order again.',
            'Ang ganda ng quality for the price. Salamat po!',
            'Maayos ang packaging, walang sira. 5 stars!',
            'Smooth transaction. The rider was polite and on time.',
            'Sulit na sulit! Worth every peso.',
            'Brand new and sealed. Thank you, seller!',
            'Second time ko na umorder dito, consistent ang quality.',
            'Mabilis mag-reply si seller and naipadala agad.',
        ],
        4 => [
            'Good quality, medyo natagalan lang ang delivery.',
            'Okay naman, as described. Packaging could be better.',
            'Nice item. The colour is a bit different from the photo but still good.',
            'Works well so far. Will update after a few weeks of use.',
            'Good value for money. Delivery took about 4 days.',
            'Maganda, kaso walang kasamang manual. Okay pa rin.',
            'Satisfied overall. May konting gasgas sa box pero okay ang item.',
        ],
        3 => [
            'Okay lang. Medyo maliit kaysa inaasahan ko.',
            'It is fine, but the box arrived dented.',
            'Average quality for the price.',
            'Dumating nang late pero kumpleto naman.',
        ],
        2 => [
            'Not what I expected from the photos.',
            'May gasgas pagdating. The seller replied naman and offered a fix.',
            'The quality is lower than I hoped for this price.',
        ],
        1 => [
            'Hindi gumana pagdating, nag-request na ako ng return.',
            'Wrong colour was sent. Waiting for the seller to sort it out.',
        ],
    ];

    /** A line about the product itself, by main category, added to most good reviews. */
    private const BY_CATEGORY = [
        'mobile-gadgets-computers' => ['Fast charging and the battery lasts all day.', 'Crisp screen, no dead pixels.', 'Works with my laptop right out of the box.'],
        'food-grocery'             => ['Fresh and far from the expiry date.', 'Masarap! Bibili ulit for merienda.', 'Well sealed, walang tagas.'],
        'home-appliances'          => ['Tahimik ang motor at malakas ang hangin.', 'Energy efficient, and it came with the warranty card.', 'Installed in minutes, works perfectly.'],
        'home-living'              => ['Soft and good quality fabric.', 'Fits perfectly in our condo.', 'Matibay at madaling linisin.'],
        'home-improvement-tools'   => ['Matibay, heavy duty talaga.', 'Used it for our renovation, works great.', 'Solid grip, hindi madulas sa kamay.'],
        'womens-fashion'           => ['True to size and comfortable.', 'Hindi kumupas after washing.', 'Ganda ng tela, hindi manipis.'],
        'mens-fashion'             => ['True to size and comfortable.', 'Hindi kumupas after washing.', 'Neat stitching, mukhang mamahalin.'],
        'bags-accessories'         => ['Sturdy stitching and a nice finish.', 'Roomy, kasya lahat ng gamit ko.', 'Looks premium in person.'],
        'health-beauty'            => ['Gentle on my skin, no irritation.', 'Ang bango and it lasts the whole day.', 'Easy to use, well packed.'],
        'sports-outdoors'          => ['Solid build, ready for weekend rides.', 'Ginagamit ko araw-araw sa gym.', 'Light and comfortable during runs.'],
        'automotive-motorcycle'    => ['Fits my motor perfectly, easy to install.', 'Original ang quality, sakto sa sasakyan.', 'Matibay, ilang linggo ko nang gamit.'],
        'baby-kids'                => ['Safe and soft for my baby. Mom-approved!', 'Gustong-gusto ng anak ko.', 'Easy to clean and no funny smell.'],
        'toys-hobbies-books'       => ['Gustong-gusto ng anak ko!', 'Complete pieces, nothing missing.', 'Good print quality, maganda ang papel.'],
        'pet-supplies'             => ['Gustong-gusto ng aso namin.', 'My cat loves it.', 'Matibay, hindi agad nasira ng alaga ko.'],
        'others'                   => ['Perfect for gifts. Maganda ang pagkakagawa.', 'Ganda tingnan sa bahay.', 'Mas maganda pa sa personal.'],
    ];

    private const REPLIES = [
        'good' => [
            'Salamat po sa pag-order! Balik po kayo ulit.',
            'Thank you for the 5 stars! Enjoy your item.',
            'Thank you po! Happy to serve you again.',
        ],
        'bad' => [
            'Sorry po sa abala. Please message us so we can replace or refund it.',
            'Thanks for the honest feedback. We will pack more carefully next time.',
            'Pasensya na po. We already sent you a message to fix this.',
        ],
    ];

    private const SHOP_COMMENTS = [
        'Responsive si seller, sumasagot agad sa chat.',
        'Fast shipping lagi, suki na ako dito.',
        'Maayos ang packaging, may bubble wrap pa.',
        'Legit shop, ilang beses na ako umorder.',
        'Accommodating and honest. Highly recommended shop.',
        'The seller updated me until the parcel was handed to the rider.',
        'Good prices and the items are always as described.',
    ];

    public static function comment(int $rating, ?string $mainCategory): string
    {
        $base = self::pick(self::BY_RATING[$rating] ?? self::BY_RATING[4]);
        $extra = self::BY_CATEGORY[$mainCategory ?? ''] ?? null;
        if ($rating >= 4 && $extra && mt_rand(1, 100) <= 70) {
            return $base . ' ' . self::pick($extra);
        }

        return $base;
    }

    public static function reply(int $rating): string
    {
        return self::pick(self::REPLIES[$rating >= 4 ? 'good' : 'bad']);
    }

    public static function shopComment(): string
    {
        return self::pick(self::SHOP_COMMENTS);
    }

    private static function pick(array $items): string
    {
        return $items[mt_rand(0, count($items) - 1)];
    }
}
