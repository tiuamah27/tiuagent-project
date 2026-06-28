export interface StorageCategory {
  label: string;
  path: string;
  sizeGB: number;
  color: string;
}

export interface DockerVolume {
  name: string;
  mountpoint: string;
  sizeGB: number;
}

export interface StorageResponse {
  totalGB: number;
  usedGB: number;
  categories: StorageCategory[];
  volumes: DockerVolume[];
}
