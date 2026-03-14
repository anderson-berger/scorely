import { APIGatewayProxyResult } from "aws-lambda";
import { apiSuccess, apiError } from "@/shared/http/response";
import { AuthorizedAPIGatewayProxyEventV2 } from "@/shared/http/api_gateway_schemas";
import { getAuthUserId } from "@/shared/http/auth_context";
import { BadRequestError } from "@/shared/error/errors";
import { parseQueryString, parseRequestBody } from "@/shared/http/parse_body";
import { $paginationQuery } from "@/shared/pagination/pagination";

import { MatchUserService } from "@/modules/match/member/user/match_user_service";
import { AddMatchMemberUseCase } from "@/modules/match/use-cases/AddMatchMemberUseCase";
import { RemoveMatchMemberUseCase } from "@/modules/match/use-cases/RemoveMatchMemberUseCase";
import { UpdateMatchMemberRoleUseCase } from "@/modules/match/use-cases/UpdateMatchMemberRoleUseCase";
import {
  $addMatchMemberBody,
  $updateMatchMemberRoleBody,
} from "@/modules/match/member/user/match_user_schemas";

const matchUserService = new MatchUserService();
const addMatchMemberUseCase = new AddMatchMemberUseCase();
const removeMatchMemberUseCase = new RemoveMatchMemberUseCase();
const updateMatchMemberRoleUseCase = new UpdateMatchMemberRoleUseCase();

// GET /matches/:id/members
export async function list(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const matchId = event.pathParameters?.id;
    if (!matchId) {
      throw new BadRequestError("Match ID is required");
    }

    const { limit, cursor } = parseQueryString<{
      limit?: string;
      cursor?: string;
    }>(event.queryStringParameters ?? null);

    const pagination = $paginationQuery.parse({ limit, cursor });

    const result = await matchUserService.findByMatchId(matchId, pagination);

    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

// POST /matches/:id/members
export async function add(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const matchId = event.pathParameters?.id;
    if (!matchId) {
      throw new BadRequestError("Match ID is required");
    }

    const requestedBy = getAuthUserId(event);
    const body = parseRequestBody(event.body);
    const { userId } = $addMatchMemberBody.parse(body);

    const member = await addMatchMemberUseCase.execute(
      matchId,
      userId,
      requestedBy,
    );

    return apiSuccess(member, 201);
  } catch (error) {
    return apiError(error);
  }
}

// PATCH /matches/:id/members/:memberId
export async function updateRole(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const matchId = event.pathParameters?.id;
    const matchUserId = event.pathParameters?.memberId;
    if (!matchId || !matchUserId) {
      throw new BadRequestError("Match ID and Member ID are required");
    }

    const requestedBy = getAuthUserId(event);
    const body = parseRequestBody(event.body);
    const { role } = $updateMatchMemberRoleBody.parse(body);

    const updated = await updateMatchMemberRoleUseCase.execute(
      matchId,
      matchUserId,
      role,
      requestedBy,
    );

    return apiSuccess(updated);
  } catch (error) {
    return apiError(error);
  }
}

// DELETE /matches/:id/members/:memberId
export async function remove(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const matchId = event.pathParameters?.id;
    const matchUserId = event.pathParameters?.memberId;
    if (!matchId || !matchUserId) {
      throw new BadRequestError("Match ID and Member ID are required");
    }

    const requestedBy = getAuthUserId(event);

    await removeMatchMemberUseCase.execute(matchId, matchUserId, requestedBy);

    return apiSuccess({ message: "Member removed successfully" });
  } catch (error) {
    return apiError(error);
  }
}
