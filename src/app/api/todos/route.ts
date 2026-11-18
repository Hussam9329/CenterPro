import { todoMutationSchema } from '@/lib/todos';
import { withReadState, withState } from '@/server/auth';
import { apiRoute, jsonResponse, readJson } from '@/server/http';
import { deleteTodos, listTodos, saveTodo } from '@/server/todos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return apiRoute(async () => jsonResponse(await withReadState(request, [], context => listTodos(context))));
}

export async function POST(request: Request) {
  return apiRoute(async () => {
    const input = await readJson(request, todoMutationSchema, 64 * 1024);
    return jsonResponse(await withState<unknown>(request, context => input.action === 'save' ? saveTodo(context, input.todo) : deleteTodos(context, input.ids)));
  });
}
