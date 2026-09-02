<?php

use App\Models\Conversation;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

// User-specific conversation updates (sidebar lists & unread count)
Broadcast::channel('user.{userId}.conversations', function (User $user, $userId) {
    return (int) $user->id === (int) $userId;
});

// Conversation-specific chat room channel
Broadcast::channel('conversation.{conversationId}', function (User $user, $conversationId) {
    if ($user->role === 'admin') {
        return true;
    }

    $conversation = Conversation::find($conversationId);
    if (! $conversation) {
        return false;
    }

    return (int) $conversation->buyer_id === (int) $user->id
        || (int) $conversation->seller_id === (int) $user->id;
});

