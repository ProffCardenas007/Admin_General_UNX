import { Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'material_assignments' })
export class MaterialAssignmentEntity {
  @PrimaryColumn({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @PrimaryColumn({ name: 'group_id', type: 'uuid' })
  groupId: string;
}
