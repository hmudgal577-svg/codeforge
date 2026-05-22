// ============================================
// Collaboration Module — WebSocket & Yjs
// ============================================

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CollaborationGateway } from './collaboration.gateway';

@Module({
  imports: [AuthModule],
  providers: [CollaborationGateway],
  exports: [CollaborationGateway],
})
export class CollaborationModule {}
