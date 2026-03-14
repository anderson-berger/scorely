import { APIGatewayProxyResult } from "aws-lambda";
import { apiSuccess, apiError } from "@/shared/http/response";
import { AuthorizedAPIGatewayProxyEventV2 } from "@/shared/http/api_gateway_schemas";
import { getAuthUserId } from "@/shared/http/auth_context";
import { BadRequestError } from "@/shared/error/errors";

import { CreateMatchUseCase } from "@/modules/match/use-cases/CreateMatchUseCase";
import { FindMyMatchesUseCase } from "@/modules/match/use-cases/FindMyMatchesUseCase";
import { GetMatchUseCase } from "@/modules/match/use-cases/GetMatchUseCase";
import { DeleteMatchUseCase } from "@/modules/match/use-cases/DeleteMatchUseCase";
import { parseQueryString, parseRequestBody } from "@/shared/http/parse_body";
import { $paginationQuery } from "@/shared/pagination/pagination";
import { $newMatch } from "@/modules/match/match_schemas";

const createMatchUseCase = new CreateMatchUseCase();
const findMyMatchesUseCase = new FindMyMatchesUseCase();
const getMatchUseCase = new GetMatchUseCase();
const deleteMatchUseCase = new DeleteMatchUseCase();

// POST /matches
export async function create(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const requestedBy = getAuthUserId(event);
    const body = parseRequestBody(event.body);
    const input = $newMatch.parse(body);

    const result = await createMatchUseCase.execute(input, requestedBy);

    return apiSuccess(result, 201);
  } catch (error) {
    return apiError(error);
  }
}

// GET /matches/my
export async function findMyMatches(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const { limit, cursor } = parseQueryString<{
      limit?: string;
      cursor?: string;
    }>(event.queryStringParameters ?? null);
    const requestedBy = getAuthUserId(event);

    const pagination = $paginationQuery.parse({ limit, cursor });

    const result = await findMyMatchesUseCase.execute(requestedBy, pagination);

    return apiSuccess(result, 200);
  } catch (error) {
    return apiError(error);
  }
}

// GET /matches/:id
export async function getById(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const matchId = event.pathParameters?.id;
    if (!matchId) {
      throw new BadRequestError("Match ID is required");
    }

    const requestedBy = getAuthUserId(event);

    const result = await getMatchUseCase.execute(matchId, requestedBy);

    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

// DELETE /matches/:id
export async function remove(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const matchId = event.pathParameters?.id;
    if (!matchId) {
      throw new BadRequestError("Match ID is required");
    }

    const requestedBy = getAuthUserId(event);

    await deleteMatchUseCase.execute(matchId, requestedBy);

    return apiSuccess({ message: "Match deleted successfully" });
  } catch (error) {
    return apiError(error);
  }
}
