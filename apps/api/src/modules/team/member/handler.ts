import { APIGatewayProxyResult } from "aws-lambda";
import { apiSuccess, apiError } from "@/utils/response/response";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "@/utils/error/errors";
import { AuthorizedAPIGatewayProxyEventV2 } from "@/utils/schemas/api-gateway.schemas";
import { $paginationQuery } from "@/utils/pagination/pagination";
import { MemberService } from "@/modules/team/member/MemberService";
import { TeamUseCases } from "@/modules/team/TeamUseCases";
import { $memberRole } from "@/modules/team/member/member.schemas";
import { z } from "zod";

const memberService = new MemberService();
const teamUseCases = new TeamUseCases();

function getAuthenticatedUserId(
  event: AuthorizedAPIGatewayProxyEventV2,
): string {
  const userId = event.requestContext.authorizer?.lambda?.userId;

  if (!userId) {
    throw new UnauthorizedError("User not authenticated");
  }

  return userId;
}

// GET /teams/my
export async function getMyTeams(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const userId = getAuthenticatedUserId(event);
    const query = event.queryStringParameters || {};
    const pagination = $paginationQuery.parse(query);

    const result = await teamUseCases.getMyTeams(userId, pagination);

    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

// GET /teams/:id/members
export async function list(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const teamId = event.pathParameters?.id;

    if (!teamId) {
      throw new BadRequestError("Team ID is required");
    }

    const query = event.queryStringParameters || {};
    const pagination = $paginationQuery.parse(query);

    const result = await memberService.findByTeamId(teamId, pagination);

    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

// POST /teams/:id/members
export async function add(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const requestedBy = getAuthenticatedUserId(event);
    const teamId = event.pathParameters?.id;

    if (!teamId) {
      throw new BadRequestError("Team ID is required");
    }

    const body = JSON.parse(event.body || "{}");
    const { userId } = z.object({ userId: z.uuid() }).parse(body);

    const member = await teamUseCases.addMember(teamId, userId, requestedBy);

    return apiSuccess(member, 201);
  } catch (error) {
    return apiError(error);
  }
}

// PATCH /teams/:id/members/:userId
export async function update(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const requestedBy = getAuthenticatedUserId(event);
    const teamId = event.pathParameters?.id;
    const userId = event.pathParameters?.userId;

    if (!teamId || !userId) {
      throw new BadRequestError("Team ID and User ID are required");
    }

    const member = await memberService.findByTeamAndUser(teamId, userId);

    if (!member) {
      throw new NotFoundError("Member not found");
    }

    const body = JSON.parse(event.body || "{}");
    const { role } = z.object({ role: $memberRole }).parse(body);

    const updated = await teamUseCases.updateMemberRole(
      teamId,
      member.id,
      role,
      requestedBy,
    );

    return apiSuccess(updated);
  } catch (error) {
    return apiError(error);
  }
}

// DELETE /teams/:id/members/:userId
export async function remove(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const requestedBy = getAuthenticatedUserId(event);
    const teamId = event.pathParameters?.id;
    const userId = event.pathParameters?.userId;

    if (!teamId || !userId) {
      throw new BadRequestError("Team ID and User ID are required");
    }

    const member = await memberService.findByTeamAndUser(teamId, userId);

    if (!member) {
      throw new NotFoundError("Member not found");
    }

    await teamUseCases.removeMember(teamId, member.id, requestedBy);

    return apiSuccess({ message: "Member removed successfully" });
  } catch (error) {
    return apiError(error);
  }
}
