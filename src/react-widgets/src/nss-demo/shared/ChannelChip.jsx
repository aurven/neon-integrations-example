import React from 'react';
import { Chip } from '../design-system/components/forms/Chip.jsx';

const CHANNEL_COLOR = {
  SFTP: 'blue',
  HTTP: 'green',
  RSS: 'yellow',
  WhatsApp: 'teal',
  S3: 'purple',
};

/** Semantic colored tag for a delivery channel type. */
export function ChannelChip({ channel }) {
  return (
    <Chip kind="info" color={CHANNEL_COLOR[channel] || 'grey'}>
      {channel}
    </Chip>
  );
}
export default ChannelChip;
