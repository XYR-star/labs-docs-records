import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function exportBackupManifest({
  exportsDir,
  records = [],
  experiments = [],
  events = [],
  inventory = [],
  locations = [],
  attachments = [],
  externalLinks = [],
  entryInventoryLinks = [],
  movements = [],
  recordingEvents = []
}) {
  await mkdir(exportsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `labs-backup-${timestamp}.json`;
  const filepath = path.join(exportsDir, filename);
  const payload = {
    schema: 'labs-eln-backup-v1',
    exported_at: new Date().toISOString(),
    experiments,
    records,
    events,
    inventory,
    locations,
    attachments,
    external_links: externalLinks,
    entry_inventory_links: entryInventoryLinks,
    inventory_movements: movements,
    recording_events: recordingEvents
  };

  await writeFile(filepath, JSON.stringify(payload, null, 2));

  return {
    kind: 'manifest',
    filename,
    filepath
  };
}
