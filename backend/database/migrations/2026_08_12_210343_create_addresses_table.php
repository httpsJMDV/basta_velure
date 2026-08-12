<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('addresses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->string('full_name', 100);
            $table->string('phone', 20);
            $table->string('address', 255);
            $table->string('floor_unit', 100)->nullable();
            $table->string('province', 100);
            $table->string('district', 100);
            $table->string('ward', 100);
            $table->enum('label', ['home', 'office'])->default('home');
            $table->boolean('is_default')->default(false);
            $table->timestamps();

            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('addresses');
    }
};
