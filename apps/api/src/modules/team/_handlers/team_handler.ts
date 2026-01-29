import { APIGatewayProxyResult } from "aws-lambda";

import { apiSuccess, apiError } from "@/utils/response/response";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "@/utils/error/errors";
import { AuthorizedAPIGatewayProxyEventV2 } from "@/utils/schemas/api-gateway.schemas";
import { $paginationQuery } from "@/utils/pagination/pagination";
import { TeamService } from "@/modules/team/team/TeamService";
import { $newTeam } from "@scorely/shared/schemas/team/team_schemas";

const teamService = new TeamService();

export async function handler(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const method = event.requestContext.http.method;

    switch (method) {
      case "POST":
        return await create(event);
      case "GET":
        return await get(event);
      default:
        throw new BadRequestError("Método HTTP não suportado");
    }
  } catch (error) {
    return apiError(error);
  }
}

async function create(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  const userId = getUserIdFromEvent(event);
  const body = JSON.parse(event.body || "{}");
  const newTeam = $newTeam.parse(body);

  const team = await teamService.create(userId, newTeam);

  return apiSuccess(team, 201);
}

async function get(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  const teamId = event.pathParameters?.id;
  const pagination = $paginationQuery.parse(event.queryStringParameters || {});

  if (teamId) {
    const team = await teamService.findById(teamId);

    if (!team) {
      throw new NotFoundError("Time não encontrado");
    }

    return apiSuccess(team);
  }

  const result = await teamService.list(pagination);
  return apiSuccess(result);
}

function getUserIdFromEvent(event: AuthorizedAPIGatewayProxyEventV2): string {
  const userId = event.requestContext.authorizer?.lambda?.userId;

  if (!userId) {
    throw new UnauthorizedError("User not authenticated");
  }

  return userId;
}
