import * as SecureStore from 'expo-secure-store';
import type {
  RecallResponse,
  PhotoUploadResponse,
  StoryUploadResponse,
  FaceLabel,
  WeaverQuestionRow,
} from '../types';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://your-backend-url.com';
const SESSION_TOKEN_KEY = 'kin_session_token';

// React Native has no DOM File; FormData file parts are {uri, name, type}.
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }

  private async handleResponse(response: Response): Promise<any> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async setSessionToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
  }

  async clearSessionToken(): Promise<void> {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  }

  async uploadPhoto(
    file: UploadFile,
    contributorId: string,
    labels: FaceLabel[],
    caption?: string
  ): Promise<PhotoUploadResponse> {
    const formData = new FormData();
    formData.append('file', file as any);
    formData.append('contributor_id', contributorId);
    formData.append('labels', JSON.stringify(labels));
    if (caption) {
      formData.append('caption', caption);
    }

    const response = await fetch(`${this.baseUrl}/api/memories/photo`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: formData,
    });

    return this.handleResponse(response);
  }

  async uploadStory(
    file: UploadFile,
    contributorId: string
  ): Promise<StoryUploadResponse> {
    const formData = new FormData();
    formData.append('file', file as any);
    formData.append('contributor_id', contributorId);

    const response = await fetch(`${this.baseUrl}/api/memories/story`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: formData,
    });

    return this.handleResponse(response);
  }

  async submitWeaverAnswer(
    questionId: string,
    file: UploadFile,
    contributorId: string
  ): Promise<StoryUploadResponse> {
    const formData = new FormData();
    formData.append('file', file as any);
    formData.append('question_id', questionId);
    formData.append('contributor_id', contributorId);

    const response = await fetch(`${this.baseUrl}/api/weaver/answer`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: formData,
    });

    return this.handleResponse(response);
  }

  async enrollFace(
    personNodeId: string,
    contributorId: string,
    memoryId: string,
    descriptor: number[]
  ): Promise<{ ok: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/faces/enroll`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({
        person_node_id: personNodeId,
        contributor_id: contributorId,
        memory_id: memoryId,
        descriptor,
      }),
    });

    return this.handleResponse(response);
  }

  async recall(
    snapshot: UploadFile,
    faceDescriptors: number[][]
  ): Promise<RecallResponse> {
    const formData = new FormData();
    formData.append('snapshot', snapshot as any);
    formData.append('faceDescriptors', JSON.stringify(faceDescriptors));

    const response = await fetch(`${this.baseUrl}/api/recall`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: formData,
    });

    return this.handleResponse(response);
  }

  async getRelatives(familyId: string): Promise<any[]> {
    const response = await fetch(
      `${this.baseUrl}/api/relatives?family_id=${familyId}`,
      {
        method: 'GET',
        headers: await this.getHeaders(),
      }
    );

    return this.handleResponse(response);
  }

  async getPersonNodes(familyId: string): Promise<any[]> {
    const response = await fetch(
      `${this.baseUrl}/api/graph-nodes?family_id=${familyId}&type=person`,
      {
        method: 'GET',
        headers: await this.getHeaders(),
      }
    );

    return this.handleResponse(response);
  }

  async getMemories(familyId: string, contributorId: string): Promise<any[]> {
    const response = await fetch(
      `${this.baseUrl}/api/memories?family_id=${familyId}&contributor_id=${contributorId}`,
      {
        method: 'GET',
        headers: await this.getHeaders(),
      }
    );

    return this.handleResponse(response);
  }

  async getWeaverQuestions(familyId: string, relativeId: string): Promise<WeaverQuestionRow[]> {
    const response = await fetch(
      `${this.baseUrl}/api/weaver/questions?family_id=${familyId}&target_relative_id=${relativeId}`,
      {
        method: 'GET',
        headers: await this.getHeaders(),
      }
    );

    return this.handleResponse(response);
  }

  async getWearer(familyId: string): Promise<any> {
    const response = await fetch(
      `${this.baseUrl}/api/wearer?family_id=${familyId}`,
      {
        method: 'GET',
        headers: await this.getHeaders(),
      }
    );

    return this.handleResponse(response);
  }
}

export const apiClient = new ApiClient();
