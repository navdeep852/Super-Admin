import fs from 'fs';

let content = fs.readFileSync('src/services/adminGatewayClient.ts', 'utf8');

const targetCrlf = '  // ---------------------------------------------------------------------------\r\n  // Health API\r\n  // ---------------------------------------------------------------------------';
const targetLf = '  // ---------------------------------------------------------------------------\n  // Health API\n  // ---------------------------------------------------------------------------';

const addition = `  // ---------------------------------------------------------------------------
  // Profile Photo & Administrator Profile Management API
  // ---------------------------------------------------------------------------

  /**
   * Upload and persist profile photo for authenticated administrator.
   * Expects Data URL (data:image/png;base64,...) or raw base64.
   */
  async uploadProfilePhoto(imageBase64: string): Promise<{ success: boolean; message: string; avatarUrl: string; admin: any }> {
    const res = await fetch(\`\${GATEWAY_BASE_URL}/api/v1/admins/me/avatar\`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ image: imageBase64 })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to upload profile photo');
    }
    return json;
  }

  /**
   * Remove profile photo for authenticated administrator.
   */
  async removeProfilePhoto(): Promise<{ success: boolean; message: string; avatarUrl: null; admin: any }> {
    const res = await fetch(\`\${GATEWAY_BASE_URL}/api/v1/admins/me/avatar\`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to remove profile photo');
    }
    return json;
  }

  /**
   * Update permitted profile fields (display name, phone number) for administrator.
   */
  async updateProfile(data: { fullName?: string; phoneNumber?: string }): Promise<{ success: boolean; message: string; data: any }> {
    const res = await fetch(\`\${GATEWAY_BASE_URL}/api/v1/admins/me/profile\`, {
      method: 'PUT',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to update administrator profile');
    }
    return json;
  }

`;

if (content.includes(targetCrlf)) {
  content = content.replace(targetCrlf, addition.replace(/\n/g, '\r\n') + targetCrlf);
  fs.writeFileSync('src/services/adminGatewayClient.ts', content, 'utf8');
  console.log('Successfully injected methods into adminGatewayClient.ts (CRLF)');
} else if (content.includes(targetLf)) {
  content = content.replace(targetLf, addition + targetLf);
  fs.writeFileSync('src/services/adminGatewayClient.ts', content, 'utf8');
  console.log('Successfully injected methods into adminGatewayClient.ts (LF)');
} else {
  console.error('Target not found in adminGatewayClient.ts');
  process.exit(1);
}
