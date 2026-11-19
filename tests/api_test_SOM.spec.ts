import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import { PostsService } from '../pages/PostsService';
const BASE_URL = 'https://dev.emeli.in.ua/wp-json/wp/v2';


const AUTH = {
  username: process.env.WP_USERNAME ?? '',
  password: process.env.WP_APP_PASSWORD ?? ''
};

 
const getAuthHeaders = () => ({
  'Authorization': `Basic ${Buffer.from(`${AUTH.username}:${AUTH.password}`).toString('base64')}`,
  'Content-Type': 'application/json'
});
const test = base.extend<{ postsService: PostsService }>({
  postsService: async ({ request }, use) => {
    await use(new PostsService(request, BASE_URL, getAuthHeaders()));
  },
});

test.describe('WordPress Posts API - CRUD Tests', () => {
  let createdPostId: number;
  test.beforeAll(async () => {
    // Перевірка доступності API
    console.log('Testing API base URL:', BASE_URL);
  });
  // Перевіряє створення й публікацію поста через API.
  // Перевіряє створення поста, новий ID та відповідність ID саме створеному посту.
  test('CREATE - Should create a new post', async ({ postsService }) => {
    // Отримуємо останній опублікований пост перед створенням нового.
    const previousResponse = await postsService.listPosts({ per_page: 1, orderby: 'id', order: 'desc' });
    expect(previousResponse.status()).toBe(200);
    const previousPosts = await previousResponse.json();
    expect(Array.isArray(previousPosts)).toBe(true);
    expect(previousPosts.length).toBeGreaterThan(0);
    const previousPostId = previousPosts[0].id;

    // Унікальний заголовок дозволяє відрізнити наш пост від інших тестових постів.
    const postData = {
      title: `Test Post from Playwright ${randomUUID()}`,
      content: 'This is test content created via API automation',
      status: 'publish',
      excerpt: 'Test excerpt'
    };

    const response = await postsService.createPost(postData);
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(201);
    const responseBody = await response.json();
    createdPostId = responseBody.id;

    // Новий ID не повинен збігатися з останнім доступним ID і має бути більшим.
    expect(responseBody).toHaveProperty('id');
    expect(typeof createdPostId).toBe('number');
    expect(createdPostId).not.toBe(previousPostId);
    expect(createdPostId).toBeGreaterThan(previousPostId);

    expect(responseBody.title.rendered).toBe(postData.title);
    expect(responseBody.status).toBe(postData.status);
    expect(typeof responseBody.content.protected).toBe('boolean');
    expect(responseBody.content.protected).toBe(false);

    // Перевіряємо категорії та числовий формат їхніх ID.
    expect(Array.isArray(responseBody.categories)).toBe(true);
    expect(responseBody.categories).toContain(1);
    expect(responseBody.categories).toEqual([1]);
    for (const category of responseBody.categories) {
      expect(String(category)).toMatch(/^\d+$/);
    }

    // Перевіряємо CSS-класи створеного поста.
    expect(Array.isArray(responseBody.class_list)).toBe(true);
    expect(responseBody.class_list).toContain('post');
    expect(responseBody.class_list).toContain(`type-${responseBody.type}`);
    expect(responseBody.class_list).toContain(`status-${responseBody.status}`);
    expect(responseBody.class_list).toContain(`post-${responseBody.id}`);
    expect(responseBody.class_list).toContain('category-news');
    expect(responseBody.class_list).toContain('hentry');

    // GET за створеним ID має повернути саме наш пост.
    const getResponse = await postsService.getPost(createdPostId);
    expect(getResponse.status()).toBe(200);
    const fetchedPost = await getResponse.json();
    expect(fetchedPost.id).toBe(createdPostId);
    expect(fetchedPost.title.rendered).toBe(postData.title);

    console.log('Previous post ID:', previousPostId);
    console.log('Created post ID:', createdPostId);
  });
  // Перевіряє, що API повертає непорожній список постів з основними полями.
  test('READ - Should get all posts', async ({ postsService }) => {
    const response = await postsService.listPosts();
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
    const posts = await response.json();
    expect(Array.isArray(posts)).toBeTruthy();
    expect(posts.length).toBeGreaterThan(0);
    // Перевірка структури першого поста
    const firstPost = posts[0];
    expect(firstPost).toHaveProperty('id');
    expect(firstPost).toHaveProperty('title');
    expect(firstPost).toHaveProperty('content');
  });
  // Перевіряє отримання поста за ID та наявність його основних полів.
  test('READ - Should get a specific post by ID', async ({ postsService }) => {
    // Використовуємо ID створеного поста або тестовий ID
    const testPostId = createdPostId || 1;
    const response = await postsService.getPost(testPostId);
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
    const post = await response.json();
    expect(post.id).toBe(testPostId);
    expect(post).toHaveProperty('title');
    expect(post).toHaveProperty('content');

    // Перевірка формату дати
expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    // Перевірка, що посилання на пост відповідає базовому URL
const postLink = new URL(post.link);
expect(postLink.origin).toBe(new URL(response.url()).origin);
  });
  // Перевіряє оновлення наявного поста через PUT.
  test('UPDATE - Should update an existing post', async ({ postsService }) => {
    test.skip(!createdPostId, 'No post created to update');
    const updateData = {
      title: 'Updated Test Post',
      content: 'This content has been updated via API',
      excerpt: 'Updated excerpt'
    };
    const response = await postsService.updatePost(createdPostId!, updateData);
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
    const updatedPost = await response.json();
    expect(updatedPost.id).toBe(createdPostId);
    expect(updatedPost.title.rendered).toBe(updateData.title);
    expect(updatedPost.content.rendered).toContain('updated');
  });
  // Перевіряє зміну заголовка поста через PATCH.
  test('PATCH - Should partially update a post', async ({ postsService }) => {
    test.skip(!createdPostId, 'No post created to patch');
    const patchData = {
      title: 'Patched Title Only'
    };
    const response = await postsService.patchPost(createdPostId!, patchData);
    expect(response.ok()).toBeTruthy();
    const patchedPost = await response.json();
    expect(patchedPost.title.rendered).toBe(patchData.title);
  });
  // Перевіряє видалення поста й відповідь 404 при повторному запиті за його ID.
  test('DELETE - Should delete a post', async ({ postsService }) => {
    test.skip(!createdPostId, 'No post created to delete');
    // Параметр force=true видаляє пост остаточно, оминаючи кошик.
    const response = await postsService.deletePost(createdPostId!, { force: true });
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
    const deletedPost = await response.json();
    expect(deletedPost.deleted).toBeTruthy();
    // Перевірка, що пост дійсно видалено
    const getResponse = await postsService.getPost(createdPostId!);
    expect(getResponse.status()).toBe(404);
  });
  // Перевіряє відповідь 404 і наявність коду помилки для неіснуючого поста.
  test('Error Handling - Should return 404 for non-existent post', async ({ postsService }) => {
    const response = await postsService.getPost(999999);
    expect(response.status()).toBe(404);
    const errorBody = await response.json();
    expect(errorBody).toHaveProperty('code');
  });
  // Перевіряє, що створення поста без авторизації повертає 401.
  test('Error Handling - Should return 401 for unauthorized create', async ({ postsService }) => {
    const postData = {
      title: 'Unauthorized Post',
      content: 'This should fail',
      status: 'publish'
    };
    const response = await postsService.createPostWithoutAuth(postData);
    expect(response.status()).toBe(401);
  });
  // Перевіряє, що фільтр status=publish повертає опубліковані пости.
  test('Filtering - Should filter posts by status', async ({ postsService }) => {
    const response = await postsService.listPosts({ status: 'publish' });
    expect(response.ok()).toBeTruthy();
    const posts = await response.json();
    posts.forEach((post: any) => {
      expect(post.status).toBe('publish');
    });
  });
  // Перевіряє, що per_page=5 обмежує відповідь п’ятьма постами.
  test('Pagination - Should respect per_page parameter', async ({ postsService }) => {
    const perPage = 5;
    const response = await postsService.listPosts({ per_page: perPage });
    expect(response.ok()).toBeTruthy();
    const posts = await response.json();
    expect(posts.length).toBeLessThanOrEqual(perPage);
  });
});
test.describe('WordPress Posts API - Validation Tests', () => {
  // Надсилає запит без заголовка й виводить тіло відповіді в консоль.
  test('Should validate required fields', async ({ postsService }) => {
    const invalidData = {
      // Відсутній обов'язковий title
      content: 'Content without title'
    };
    const response = await postsService.createPost(invalidData);

    const body = await response.json();
    console.log('Validation response:', body);
  });
  // Перевіряє збереження спеціальних символів у заголовку чернетки.
  test('Should handle special characters in title', async ({ postsService }) => {
    const specialCharsData = {
      title: 'Test with  & symbols <>"',
      content: 'Testing special characters',
      status: 'draft'
    };
    const response = await postsService.createPost(specialCharsData);
    expect(response.ok()).toBeTruthy();
    const post = await response.json();
    // Порівнює title.raw з надісланим заголовком, щоб перевірити символи до HTML-форматування.
    expect(post.title.raw).toBe(specialCharsData.title);
    // Cleanup
    await postsService.deletePost(post.id);
  });
});
test.describe('WordPress Posts API - Performance Tests', () => {
  // Перевіряє, що запит списку постів успішний і триває менше двох секунд.
  test('GET all posts - should respond within acceptable time', async ({ postsService }) => {
    const startTime = Date.now();
    const response = await postsService.listPosts();
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    expect(response.ok()).toBeTruthy();
    console.log(`GET all posts response time: ${responseTime}ms`);
    // Перевірка, що запит виконується швидше 2 секунд
    expect(responseTime).toBeLessThan(2000);
 
    if (responseTime > 1000) {
      console.warn(` Warning: Response time ${responseTime}ms exceeds 1 second`);
    }
  });
  // Перевіряє, що запит поста з ID 1 триває менше 1500 мс.
  test('GET single post - should respond within acceptable time', async ({ postsService }) => {
    const startTime = Date.now();
    const response = await postsService.getPost(1);
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    console.log(`GET single post response time: ${responseTime}ms`);
    expect(responseTime).toBeLessThan(1500);
    if (responseTime > 800) {
      console.warn(` Warning: Single post response time ${responseTime}ms exceeds 800ms`);
    }
  });
  // Вимірює час створення чернетки через POST і перевіряє його відносно заданого порога.
  test('POST create post - should respond within acceptable time', async ({ postsService }) => {
    const postData = {
      title: 'Performance Test Post',
      content: 'Testing POST request speed',
      status: 'draft'
    };
    const startTime = Date.now();
    const response = await postsService.createPost(postData);
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    expect(response.ok()).toBeTruthy();
    console.log(`POST create post response time: ${responseTime}ms`);
    expect(responseTime).toBeLessThan(3000);
    // Cleanup
    const post = await response.json();
    await postsService.deletePost(post.id);
  });
  // Створює чернетку й перевіряє час її оновлення через PUT.
  test('PUT update post - should respond within acceptable time', async ({ postsService }) => {
    // Спочатку створюємо пост
    const createResponse = await postsService.createPost({
      title: 'Post to Update',
      content: 'Initial content',
      status: 'draft'
    });
    const post = await createResponse.json();
    const postId = post.id;
    // Тестуємо швидкість оновлення
    const updateData = {
      title: 'Updated Title',
      content: 'Updated content'
    };
    const startTime = Date.now();
    const response = await postsService.updatePost(postId, updateData);
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    expect(response.ok()).toBeTruthy();
    console.log(`PUT update post response time: ${responseTime}ms`);
    expect(responseTime).toBeLessThan(3000);
    // Cleanup
    await postsService.deletePost(postId);
  });
  // Створює чернетку й перевіряє час її видалення через DELETE.
  test('DELETE post - should respond within acceptable time', async ({ postsService }) => {
    // Створюємо пост для видалення
    const createResponse = await postsService.createPost({
      title: 'Post to Delete',
      content: 'Will be deleted',
      status: 'draft'
    });
    const post = await createResponse.json();
    const postId = post.id;
    // Тестуємо швидкість видалення
    const startTime = Date.now();
    const response = await postsService.deletePost(postId);
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    expect(response.ok()).toBeTruthy();
    console.log(`DELETE post response time: ${responseTime}ms`);
    expect(responseTime).toBeLessThan(2000);
  });
  // Надсилає п’ять паралельних GET-запитів і перевіряє середній час відповіді.
  test('Multiple concurrent GET requests - average response time', async ({ postsService }) => {
    const numberOfRequests = 5;
    const responseTimes: number[] = [];
    const requests = Array.from({ length: numberOfRequests }, async (_, i) => {
      const startTime = Date.now();
      const response = await postsService.listPosts();
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      responseTimes.push(responseTime);
      return response;
    });
    const responses = await Promise.all(requests);
    responses.forEach(response => {
      expect(response.ok()).toBeTruthy();
    });
    const averageTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const maxTime = Math.max(...responseTimes);
    const minTime = Math.min(...responseTimes);
    console.log(`Concurrent requests stats:`);
    console.log(`  - Average: ${averageTime.toFixed(2)}ms`);
    console.log(`  - Min: ${minTime}ms`);
    console.log(`  - Max: ${maxTime}ms`);
    console.log(`  - All times: ${responseTimes.join(', ')}ms`);
    expect(averageTime).toBeLessThan(2500);
  });
  // Надсилає десять послідовних GET-запитів і перевіряє їхню швидкодію.
  test('Load test - Sequential requests performance', async ({ postsService }) => {
    const numberOfRequests = 10;
    const responseTimes: number[] = [];
    const startTotal = Date.now();
    for (let i = 0; i < numberOfRequests; i++) {
      const startTime = Date.now();
      const response = await postsService.listPosts({ per_page: 5 });
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      responseTimes.push(responseTime);
      expect(response.ok()).toBeTruthy();
    }
    const endTotal = Date.now();
    const totalTime = endTotal - startTotal;
    const averageTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    console.log(`Sequential load test (${numberOfRequests} requests):`);
    console.log(`  - Total time: ${totalTime}ms`);
    console.log(`  - Average per request: ${averageTime.toFixed(2)}ms`);
    console.log(`  - Requests per second: ${(numberOfRequests / (totalTime / 1000)).toFixed(2)}`);

 
    expect(averageTime).toBeLessThan(2000);
  });
  // Вимірює та виводить час відповіді для різних значень per_page.
  test('Response time by pagination size', async ({ postsService }) => {
    const pageSizes = [1, 5, 10, 20, 50];
    const results: { size: number; time: number }[] = [];
    for (const size of pageSizes) {
      const startTime = Date.now();
      const response = await postsService.listPosts({ per_page: size });
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      expect(response.ok()).toBeTruthy();
      results.push({ size, time: responseTime });
    }
    console.log(`Response time by page size:`);
    results.forEach(result => {
      console.log(`  - ${result.size} posts: ${result.time}ms`);
    });
    results.forEach(result => {
      expect(result.time).toBeLessThan(3000);
    });
  });
});