
const API_URL = "http://127.0.0.1:8000";

export interface ShoppingItem {
  id: number;
  shopping_list_id: number;
  name: string;
  quantity: number;
  completed: boolean;
}

export interface ShoppingList {
  id: number;
  name: string;
  items: ShoppingItem[];
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status}`
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  getLists: () =>
    request<ShoppingList[]>("/api/shopping-lists"),

  createList: (name: string) =>
    request<ShoppingList>("/api/shopping-lists", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  addItem: (
    listId: number,
    name: string,
    quantity: number = 1
  ) =>
    request<ShoppingItem>(
      `/api/shopping-lists/${listId}/items`,
      {
        method: "POST",
        body: JSON.stringify({ name, quantity }),
      }
    ),

  updateItem: (
    itemId: number,
    data: Partial<Pick<
      ShoppingItem,
      "name" | "quantity" | "completed"
    >>
  ) =>
    request<ShoppingItem>(
      `/api/shopping-list-items/${itemId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),

  deleteItem: (itemId: number) =>
    request<void>(
      `/api/shopping-list-items/${itemId}`,
      { method: "DELETE" }
    ),

  deleteList: (listId: number) =>
    request<void>(
      `/api/shopping-lists/${listId}`,
      { method: "DELETE" }
    ),
};
