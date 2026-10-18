<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Commerce\CartService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The buyer's cart on the server (B6). Every response is the whole cart, priced live. */
class CartController extends Controller
{
    public function __construct(private readonly CartService $cart) {}

    /** GET /cart */
    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->cart->view($request->user())]);
    }

    /** POST /cart/items {variant_id, quantity} */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['variant_id' => ['required', 'integer'], 'quantity' => ['required']], [
            'variant_id.required' => 'Choose the options first.',
            'quantity.required'   => 'Enter a quantity.',
        ]);
        $this->cart->add($request->user(), (int) $data['variant_id'], $data['quantity']);

        return response()->json(['message' => 'Added to your cart.', 'data' => $this->cart->view($request->user())], 201);
    }

    /** PATCH /cart/items/{line} {quantity?, selected?} */
    public function update(Request $request, int $line): JsonResponse
    {
        $this->cart->update($request->user(), $line, $request->only(['quantity', 'selected']));

        return response()->json(['data' => $this->cart->view($request->user())]);
    }

    /** DELETE /cart/items/{line} */
    public function destroy(Request $request, int $line): JsonResponse
    {
        $this->cart->remove($request->user(), $line);

        return response()->json(['message' => 'Removed from your cart.', 'data' => $this->cart->view($request->user())]);
    }

    /** POST /cart/select {selected, seller_id?}: selects every line that can be checked out, or clears them. */
    public function select(Request $request): JsonResponse
    {
        $data = $request->validate(['selected' => ['required', 'boolean'], 'seller_id' => ['nullable', 'integer']]);
        $this->cart->select($request->user(), (bool) $data['selected'], isset($data['seller_id']) ? (int) $data['seller_id'] : null);

        return response()->json(['data' => $this->cart->view($request->user())]);
    }

    /** POST /cart/merge {items: [{variant_id, quantity}]}: the guest cart, after logging in. */
    public function merge(Request $request): JsonResponse
    {
        $data = $request->validate(['items' => ['required', 'array', 'max:100'], 'items.*.variant_id' => ['required', 'integer'], 'items.*.quantity' => ['required']]);
        $skipped = $this->cart->merge($request->user(), $data['items']);

        return response()->json(['skipped' => $skipped, 'data' => $this->cart->view($request->user())]);
    }
}
