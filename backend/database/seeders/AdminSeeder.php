<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        if (User::where('role', 'admin')->exists()) {
            return;
        }

        $user = User::create([
            'first_name' => 'Velure',
            'last_name'  => 'Admin',
            'email'      => 'admin@gmail.com',
            'phone'      => '+639000000000',
            'password'   => Hash::make('admin123'),
        ]);

        $user->role   = 'admin';
        $user->status = 'active';
        $user->save();
    }
}
