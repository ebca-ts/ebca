import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, DiscardPolicy, RetentionPolicy, StorageType } from 'nats';
import type { StreamConfig } from 'nats';

export const EBCA_DELAYED_TOPIC_PREFIX = 'delayed';
export const EBCA_DELAYED_STREAM_NAME = 'EBCA_DELAYED';

type EbcaDelayedStreamConfig = Partial<StreamConfig> & {
  name: string;
  subjects: string[];
  allow_msg_schedules: boolean;
};

const logger = new Logger('EbcaDelayedStreamBootstrap');

export const EBCA_DELAYED_STREAM_CONFIG: EbcaDelayedStreamConfig = {
  name: EBCA_DELAYED_STREAM_NAME,
  subjects: [`${EBCA_DELAYED_TOPIC_PREFIX}.>`],
  retention: RetentionPolicy.Limits,
  storage: StorageType.File,
  discard: DiscardPolicy.Old,
  max_consumers: -1,
  max_msgs: -1,
  max_bytes: -1,
  max_age: 0,
  max_msgs_per_subject: -1,
  max_msg_size: -1,
  duplicate_window: 0,
  allow_rollup_hdrs: false,
  num_replicas: 3,
  deny_delete: false,
  deny_purge: false,
  allow_direct: false,
  mirror_direct: false,
  allow_msg_schedules: true,
  republish: {
    src: `${EBCA_DELAYED_TOPIC_PREFIX}.ebca.>`,
    dest: 'ebca.>',
  },
};

@Injectable()
export class EbcaDelayedStreamBootstrap implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const servers = this.configService.getOrThrow<string[]>('NATS_SERVERS');
    const natsConnection = await connect({ servers });
    try {
      const jetStreamManager = await natsConnection.jetstreamManager();
      try {
        await jetStreamManager.streams.info(EBCA_DELAYED_STREAM_NAME);
        await jetStreamManager.streams.update(
          EBCA_DELAYED_STREAM_NAME,
          EBCA_DELAYED_STREAM_CONFIG,
        );
        logger.debug(
          `Ensured JetStream stream ${EBCA_DELAYED_STREAM_NAME} for delayed EBCA messages.`,
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('stream not found')
        ) {
          await jetStreamManager.streams.add(EBCA_DELAYED_STREAM_CONFIG);
          logger.log(
            `Created JetStream stream ${EBCA_DELAYED_STREAM_NAME} for ${EBCA_DELAYED_STREAM_CONFIG.subjects.join(',')}.`,
          );
          return;
        }
        throw error;
      }
    } finally {
      await natsConnection.drain();
    }
  }
}
