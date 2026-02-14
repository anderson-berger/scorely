import { APIGatewayProxyResult } from "aws-lambda";
import { apiSuccess, apiError } from "@/utils/http/response";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "@/utils/error/errors";
import { AuthorizedAPIGatewayProxyEventV2 } from "@/utils/http/api_gateway_schemas";
import { TeamService } from "@/modules/team/team/TeamService";
import { TeamUseCases } from "@/modules/team/TeamUseCases";
import { $newTeam, $team } from "@/modules/team/team/team.schemas";

const teamService = new TeamService();
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

// POST /teams
export async function create(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const requestedBy = getAuthenticatedUserId(event);
    const body = JSON.parse(event.body || "{}");
    const input = $newTeam.parse(body);

    const result = await teamUseCases.createTeam(input, requestedBy);

    return apiSuccess(result, 201);
  } catch (error) {
    return apiError(error);
  }
}

// GET /teams/:id
export async function getById(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const teamId = event.pathParameters?.id;

    if (!teamId) {
      throw new BadRequestError("Team ID is required");
    }

    const team = await teamService.findById(teamId);

    if (!team) {
      throw new NotFoundError("Team not found");
    }

    return apiSuccess(team);
  } catch (error) {
    return apiError(error);
  }
}

// PATCH /teams/:id
export async function update(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const teamId = event.pathParameters?.id;

    if (!teamId) {
      throw new BadRequestError("Team ID is required");
    }

    const body = JSON.parse(event.body || "{}");
    const input = $team.parse(body);

    if (input.id !== teamId) {
      throw new BadRequestError("Team ID mismatch");
    }

    const team = await teamService.update(teamId, input);

    return apiSuccess(team);
  } catch (error) {
    return apiError(error);
  }
}

// DELETE /teams/:id
export async function remove(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const requestedBy = getAuthenticatedUserId(event);
    const teamId = event.pathParameters?.id;

    if (!teamId) {
      throw new BadRequestError("Team ID is required");
    }

    await teamUseCases.deleteTeam(teamId, requestedBy);

    return apiSuccess({ message: "Team deleted successfully" });
  } catch (error) {
    return apiError(error);
  }
}
