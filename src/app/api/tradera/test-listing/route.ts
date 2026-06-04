import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { getUserAuth } from "@/lib/tradera/auth";
import { addItem, buildTestListingRequest } from "@/lib/tradera/client";
import { isSandbox } from "@/lib/tradera/config";

/**
 * The Tradera auth spike: posts a single, hardcoded, deliberately-cheap test
 * listing via RestrictedService.AddItem on the connected user's behalf.
 *
 * Guards:
 *   - requires a connected user (cookie token or TRADERA_USER_ID/TOKEN env vars)
 *   - requires TRADERA_TEST_CATEGORY_ID so we never post with an empty category
 *   - defaults to the sandbox; flip TRADERA_SANDBOX=false only when you mean it
 */
export async function POST() {
  try {
    const userAuth = await getUserAuth();
    if (!userAuth) {
      return NextResponse.json(
        {
          ok: false,
          kind: "auth",
          error:
            "No Tradera user token. Connect a Tradera account first, or set TRADERA_USER_ID and TRADERA_USER_TOKEN.",
        },
        { status: 401 },
      );
    }

    const request = buildTestListingRequest();
    if (!request.categoryId) {
      return NextResponse.json(
        {
          ok: false,
          kind: "config",
          error:
            "Set TRADERA_TEST_CATEGORY_ID to a valid sandbox category id before posting the test listing.",
        },
        { status: 400 },
      );
    }

    const result = await addItem(request, userAuth);
    return NextResponse.json({
      ok: true,
      sandbox: isSandbox(),
      request,
      result,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
