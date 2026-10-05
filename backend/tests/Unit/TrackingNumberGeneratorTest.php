<?php

namespace Tests\Unit;

use App\Models\Parcel;
use App\Services\TrackingNumberGenerator;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class TrackingNumberGeneratorTest extends TestCase
{
    use DatabaseTransactions;

    private TrackingNumberGenerator $generator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->generator = new TrackingNumberGenerator();
    }

    public function test_generates_valid_format_and_character_set(): void
    {
        $date = Carbon::parse('2026-10-05 12:00:00');
        $trackingNumber = $this->generator->generate($date);

        $this->assertEquals(17, strlen($trackingNumber));
        $this->assertStringStartsWith('LIT-261005-', $trackingNumber);

        // Verify suffix matches unambiguous regex pattern
        $pattern = '/^LIT-261005-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/';
        $this->assertMatchesRegularExpression($pattern, $trackingNumber);

        // Verify lookalike characters 0, 1, I, O are absent from suffix
        $suffix = substr($trackingNumber, 11);
        $this->assertDoesNotMatch($suffix, ['0', '1', 'I', 'O']);
    }

    public function test_retries_on_collision_and_finds_unused_number(): void
    {
        $date = Carbon::parse('2026-10-05 12:00:00');

        // Create a mock generator that produces a fixed candidate on first try, then a second unique one
        $mockGenerator = $this->getMockBuilder(TrackingNumberGenerator::class)
            ->onlyMethods(['randomString'])
            ->getMock();

        $collidingSuffix = '222222';
        $uniqueSuffix = '333333';

        // Pre-insert the colliding candidate
        Parcel::create([
            'tracking_number' => "LIT-261005-{$collidingSuffix}",
            'status'          => 'READY_FOR_PICKUP',
        ]);

        $mockGenerator->expects($this->exactly(2))
            ->method('randomString')
            ->willReturnOnConsecutiveCalls($collidingSuffix, $uniqueSuffix);

        $result = $mockGenerator->generate($date);

        $this->assertEquals("LIT-261005-{$uniqueSuffix}", $result);
    }

    private function assertDoesNotMatch(string $subject, array $forbiddenChars): void
    {
        foreach ($forbiddenChars as $char) {
            $this->assertFalse(str_contains($subject, $char), "Candidate string '{$subject}' contains forbidden character '{$char}'.");
        }
    }
}
