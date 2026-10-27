import { POLICY_CATALOG_SEED } from './policy-catalog.seed';

describe('policy catalog seed', () => {
  const byKey = new Map(
    POLICY_CATALOG_SEED.map((policy) => [policy.key, policy]),
  );

  it('has unique policy keys', () => {
    expect(byKey.size).toBe(POLICY_CATALOG_SEED.length);
  });

  it('includes the Embedded Signup and coexistence policies', () => {
    expect(byKey.get('channels.whatsapp.embeddedSignup.enabled')).toMatchObject(
      {
        type: 'boolean',
        defaultValue: true,
        group: 'channels',
      },
    );
    expect(
      byKey.get('limits.maxWhatsappEmbeddedSignupConnections'),
    ).toMatchObject({
      type: 'number',
      defaultValue: 0,
      group: 'limits',
    });
    expect(byKey.get('features.coexistenceHistoryImport')).toMatchObject({
      type: 'boolean',
      defaultValue: true,
      group: 'features',
    });
  });

  it('enables code nodes by default', () => {
    expect(byKey.get('features.codeNode')).toMatchObject({
      type: 'boolean',
      defaultValue: true,
      group: 'features',
    });
  });
});
