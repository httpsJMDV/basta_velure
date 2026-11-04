<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

Route::get('/', function () {
    return view('welcome');
});

// Photos keep their /storage/... links on Laravel Cloud, where the "public" disk is a
// bucket and there is no public/storage symlink: stream the file from the disk instead.
Route::get('/storage/{path}', function (string $path) {
    abort_unless(Storage::disk('public')->exists($path), 404);

    return Storage::disk('public')->response($path, null, ['Cache-Control' => 'public, max-age=604800']);
})->where('path', '.*');
