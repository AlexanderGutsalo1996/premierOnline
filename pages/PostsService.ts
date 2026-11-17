import type { APIRequestContext } from '@playwright/test';

// Дані поста, які можна передати під час створення або оновлення.
type PostData = {
  title?: string;
  content?: string;
  status?: string;
  excerpt?: string;
};

// Параметри фільтрації та розміру сторінки списку постів.
type ListPostsParams = {
  status?: string;
  per_page?: number;
  orderby?: 'id' | 'date' | 'title';
  order?: 'asc' | 'desc';
};

// Об’єднує запити до WordPress API для роботи з постами.
export class PostsService {
  // Адреса колекції постів для отримання списку й створення записів.
  private readonly postsEndpoint: string;
  // Формує адресу конкретного поста за його ID.
  private readonly postByIdEndpoint = (id: number) =>
    `${this.postsEndpoint}/${id}`;

  // Зберігає контекст запитів і заголовки авторизації та формує адресу колекції.
  constructor(
    private readonly request: APIRequestContext,
    apiBaseUrl: string,
    private readonly authHeaders: Record<string, string>,
  ) {
    this.postsEndpoint = `${apiBaseUrl.replace(/\/+$/, '')}/posts`;
  }

  // Отримує список постів із необов’язковими параметрами запиту.
  listPosts(params?: ListPostsParams) {
    return this.request.get(this.postsEndpoint, { params });
  }

  // Отримує один пост за ID.
  getPost(id: number) {
    return this.request.get(this.postByIdEndpoint(id));
  }

  // Створює пост із переданими даними та заголовками авторизації.
  createPost(data: PostData) {
    return this.request.post(this.postsEndpoint, {
      headers: this.authHeaders,
      data,
    });
  }

  // Надсилає запит на створення без додавання заголовків авторизації сервісу.
  createPostWithoutAuth(data: PostData) {
    return this.request.post(this.postsEndpoint, { data });
  }

  // Оновлює пост за ID через PUT.
  updatePost(id: number, data: PostData) {
    return this.request.put(this.postByIdEndpoint(id), {
      headers: this.authHeaders,
      data,
    });
  }

  // Частково оновлює пост за ID через PATCH.
  patchPost(id: number, data: PostData) {
    return this.request.patch(this.postByIdEndpoint(id), {
      headers: this.authHeaders,
      data,
    });
  }

  // Видаляє пост за ID. Параметр force: true видаляє його остаточно, оминаючи кошик.
  deletePost(id: number, params?: { force: boolean }) {
    return this.request.delete(this.postByIdEndpoint(id), {
      headers: this.authHeaders,
      params,
    });
  }
}
