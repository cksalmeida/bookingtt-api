jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(function (this: any) {
    this.set = jest.fn();
    this.del = jest.fn();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let mockSet: jest.Mock;
  let mockDel: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisService],
    }).compile();

    service = module.get<RedisService>(RedisService);

    mockSet = (service as any).set as jest.Mock;
    mockDel = (service as any).del as jest.Mock;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('acquireMultipleLocks', () => {
    it('deve adquirir todos os locks e retornar as chaves em ordem alfabética', async () => {
      mockSet.mockResolvedValue('OK');

      const keys = ['lock:seat:c', 'lock:seat:a', 'lock:seat:b'];
      const result = await service.acquireMultipleLocks(keys, 5000);

      expect(result).toEqual(['lock:seat:a', 'lock:seat:b', 'lock:seat:c']);

      expect(mockSet).toHaveBeenCalledTimes(3);

      expect(mockSet).toHaveBeenCalledWith('lock:seat:a', 'LOCKED', 'PX', 5000, 'NX');
    });

    it('deve retornar [] e liberar locks já adquiridos se um lock falhar', async () => {
      mockSet
        .mockResolvedValueOnce('OK') 
        .mockResolvedValueOnce(null); 

      const keys = ['lock:seat:a', 'lock:seat:b'];
      const result = await service.acquireMultipleLocks(keys, 5000);

      expect(result).toEqual([]);

      expect(mockDel).toHaveBeenCalledWith('lock:seat:a');
      expect(mockDel).toHaveBeenCalledTimes(1);
    });

    it('deve retornar [] sem chamar del se nenhum lock for adquirido', async () => {
      mockSet.mockResolvedValue(null); 

      const result = await service.acquireMultipleLocks(['lock:seat:x'], 5000);

      expect(result).toEqual([]);
      expect(mockDel).not.toHaveBeenCalled();
    });
  });

  describe('releaseMultipleLocks', () => {
    it('deve chamar del para cada chave fornecida', async () => {
      mockDel.mockResolvedValue(1);

      await service.releaseMultipleLocks(['lock:seat:a', 'lock:seat:b']);

      expect(mockDel).toHaveBeenCalledTimes(2);
      expect(mockDel).toHaveBeenCalledWith('lock:seat:a');
      expect(mockDel).toHaveBeenCalledWith('lock:seat:b');
    });

    it('não deve chamar del se a lista de chaves estiver vazia', async () => {
      await service.releaseMultipleLocks([]);

      expect(mockDel).not.toHaveBeenCalled();
    });
  });
});
