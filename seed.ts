import pg from 'pg';
import "dotenv/config";
import fs from 'fs';
import path from 'path';

// Extract data from db.ts logic or directly hardcode the initial data matching db.ts
const customersData = [
  { id: '1', name: 'Acme Corp', contact: 'John Doe', stage: 'Negotiation', score: 95, risk: 10, intent: 'High', industry: null, address: null, country: null, notes: null },
  { id: '2', name: 'Global Tech', contact: 'Jane Smith', stage: 'Qualified', score: 78, risk: 25, intent: 'Medium', industry: null, address: null, country: null, notes: null },
  { id: '3', name: 'Synergy Ltd', contact: 'Alice Brown', stage: 'Lead', score: 45, risk: 5, intent: 'Low', industry: null, address: null, country: null, notes: null },
];

const customerContactsData = [
  { id: '1', customer_id: '1', type: 'Email', value: 'john@acme.com' },
  { id: '2', customer_id: '2', type: 'Email', value: 'jane@globaltech.com' },
  { id: 'w1', customer_id: '2', type: 'WhatsApp', value: '15550000001' },
  { id: '3', customer_id: '3', type: 'Email', value: 'alice@synergy.com' },
];

const sharedLogs = [
  { id: '1', time: 'Today, 10:30 AM', event: 'AI identified high read-rate on Quotation #1044', type: 'ai' },
  { id: '2', time: 'Yesterday, 2:15 PM', event: 'Customer opened email: "Updated Pricing for Bulk"', type: 'action' },
  { id: '3', time: 'May 20, 11:00 AM', event: 'Sent Quotation #1044 ($42,000)', type: 'comm' },
  { id: 'h1', time: 'May 18, 9:00 AM', event: 'Initial inquiry received via Website Form', type: 'comm' },
  { id: 'h2', time: 'May 18, 9:15 AM', event: 'AI auto-replied with product catalog', type: 'ai' },
  { id: 'h3', time: 'May 19, 10:20 AM', event: 'Customer requested bulk pricing', type: 'action' },
  { id: 'h4', time: 'May 19, 11:00 AM', event: 'Agent generated quotation #1044', type: 'comm' }
];

const documentsData = [
  { id: '1', title: 'Product Catalog Q3 2026', pieces: 145, status: 'Active (Vectorized)', date: '3 days ago' },
  { id: '2', title: 'Standard Operating Procedures - Pricing', pieces: 42, status: 'Active (Vectorized)', date: '1 week ago' },
  { id: '3', title: 'FAQ - Logistics and Shipping', pieces: 18, status: 'Active (Vectorized)', date: '2 weeks ago' }
];

const agentsData = [
  { id: '1', name: 'Lead Qualification Agent', role: 'Qualifies inbound emails and determines lead score.', status: 'Active', tasks: 145, harness: 'Auto' },
  { id: '2', name: 'SDR Agent', role: 'Automates initial follow-ups and meeting scheduling.', status: 'Active', tasks: 89, harness: 'Human-in-the-loop' },
  { id: '3', name: 'Manager Agent', role: 'Routes tasks and flags high-risk conversations to humans.', status: 'Active', tasks: 312, harness: 'Auto' },
  { id: '4', name: 'Proposal Agent', role: 'Drafts quotes based on CRM price rules and inventory.', status: 'Idle', tasks: 12, harness: 'Human-in-the-loop' },
];

const systemUsersData = [
  { id: 'u1', name: 'Super Admin', email: 'admin@acmecorp.com', role: 'superadmin', status: 'Active', permissions: ['all'] },
  { id: 'u2', name: 'Alice Chen', email: 'alice@acmecorp.com', role: 'sales', status: 'Active', permissions: ['view_customers', 'edit_customers', 'reply_inbox'] },
  { id: 'u3', name: 'Bob Smith', email: 'bob@acmecorp.com', role: 'sales', status: 'Active', permissions: ['view_customers', 'reply_inbox'] },
  { id: 'u4', name: 'Charlie Davis', email: 'charlie@acmecorp.com', role: 'support', status: 'Active', permissions: ['view_customers', 'reply_inbox'] }
];

const inboxData = [
  { id: 'msg_local_1', sender: 'john@acme.com', target: 'agent@example.com', intent: 'Inquiry', subject: 'Bulk Pricing Request', summary: 'Customer asking for a 10k units volume discount and lead times.', channel: 'Email', date: '10:30 AM', read: false },
  { id: 'msg_local_2', sender: '15550000001', target: '15551234567', intent: 'Support', subject: 'MOQ clarification', summary: 'Checking if they can order below MOQ for their first testing round.', channel: 'WhatsApp', date: 'Yesterday', read: true }
];

const threadData = [
  { id: 't1', message_id: 'msg_local_1', sender: 'user', content: 'Hello, I am interested in ordering 10,000 units of the premium widgets. What is the best volume discount you can offer for this quantity? Also, let me know the estimated lead time to North America.', time: '10:30 AM' },
  { id: 't1_2', message_id: 'msg_local_2', sender: 'user', content: 'Hi, I saw your MOQ is 500 units. Since this is our first time working together, is it possible to order 100 units just for quality testing?', time: 'Yesterday 2:15 PM' },
  { id: 't2_2', message_id: 'msg_local_2', sender: 'agent', content: 'Hi there! We strictly follow the MOQ of 500 units for standard pricing, but for a one-time paid sample order, we could do 100 units at a 20% premium. Would that work for you?', time: 'Yesterday 2:40 PM' }
];

const agentRunsData = [
  { id: 'run_1', customer_id: '1', agent_id: '3', task_type: 'Follow-up Email', status: 'Pending', created_at: new Date(Date.now() - 3600000).toISOString() }
];

const agentStepsData = [
  { id: 's_1', run_id: 'run_1', step_type: 'Tool', tool_name: 'get_customer_profile', status: 'Success', created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 's_2', run_id: 'run_1', step_type: 'Tool', tool_name: 'draft_email', status: 'Success', created_at: new Date(Date.now() - 3590000).toISOString() }
];

const agentApprovalsData = [
  { id: 'app_1', run_id: 'run_1', action_type: 'send_email', proposed_payload: JSON.stringify({ to: 'john@acme.com', subject: 'Follow up on our discussion', body: 'Hi John,\n\nJust checking in on the volume discounts we discussed. Let me know if you need any adjustments to the quote.' }), status: 'Pending', created_at: new Date(Date.now() - 3590000).toISOString() }
];

async function seed() {
  if (!process.env.PG_VECTOR_URL) {
    console.error("No PG_VECTOR_URL found in environment");
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: process.env.PG_VECTOR_URL
  });

  try {
    await client.connect();
    console.log("Connected to PostgreSQL");

    // Initialize extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');

    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        contact VARCHAR(255),
        stage VARCHAR(255),
        score INTEGER,
        risk INTEGER,
        intent VARCHAR(255),
        industry VARCHAR(255),
        address VARCHAR(255),
        country VARCHAR(255),
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS customer_contacts (
        id VARCHAR(255) PRIMARY KEY,
        customer_id VARCHAR(255) REFERENCES customers(id) ON DELETE CASCADE,
        type VARCHAR(255),
        value VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS customer_logs (
        id VARCHAR(255) PRIMARY KEY,
        customer_id VARCHAR(255) REFERENCES customers(id) ON DELETE CASCADE,
        time VARCHAR(255),
        event TEXT,
        type VARCHAR(50)
      );

      CREATE TABLE IF NOT EXISTS system_users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255),
        role VARCHAR(50),
        status VARCHAR(50),
        permissions JSONB
      );

      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255),
        pieces INTEGER,
        status VARCHAR(255),
        date VARCHAR(255),
        content TEXT,
        embedding vector(1536)
      );

      CREATE TABLE IF NOT EXISTS agents (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        role TEXT,
        status VARCHAR(50),
        tasks INTEGER,
        harness VARCHAR(50)
      );

      CREATE TABLE IF NOT EXISTS agent_runs (
        id VARCHAR(255) PRIMARY KEY,
        customer_id VARCHAR(255),
        agent_id VARCHAR(255),
        task_type VARCHAR(255),
        status VARCHAR(50),
        input_json JSONB,
        output_json JSONB,
        current_step VARCHAR(255),
        error_message TEXT,
        created_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS agent_steps (
        id VARCHAR(255) PRIMARY KEY,
        run_id VARCHAR(255) REFERENCES agent_runs(id) ON DELETE CASCADE,
        step_type VARCHAR(50),
        tool_name VARCHAR(255),
        input_json JSONB,
        output_json JSONB,
        status VARCHAR(50),
        created_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS agent_approvals (
        id VARCHAR(255) PRIMARY KEY,
        run_id VARCHAR(255) REFERENCES agent_runs(id) ON DELETE CASCADE,
        action_type VARCHAR(255),
        proposed_payload JSONB,
        status VARCHAR(50),
        created_at TIMESTAMP,
        approved_at TIMESTAMP,
        approved_by VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS inbox_messages (
        id VARCHAR(255) PRIMARY KEY,
        sender VARCHAR(255),
        target VARCHAR(255),
        intent VARCHAR(255),
        subject VARCHAR(255),
        summary TEXT,
        channel VARCHAR(50),
        date VARCHAR(255),
        read BOOLEAN,
        assignee VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS thread_messages (
        id VARCHAR(255) PRIMARY KEY,
        message_id VARCHAR(255) REFERENCES inbox_messages(id) ON DELETE CASCADE,
        sender VARCHAR(50),
        content TEXT,
        time VARCHAR(255)
      );
    `);
    console.log("Tables created successfully");

    // Insert data
    for (const c of customersData) {
      await client.query('INSERT INTO customers (id, name, contact, stage, score, risk, intent, industry, address, country, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO NOTHING', 
        [c.id, c.name, c.contact, c.stage, c.score, c.risk, c.intent, c.industry, c.address, c.country, c.notes]);
        
      for (const log of sharedLogs) {
        await client.query('INSERT INTO customer_logs (id, customer_id, time, event, type) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
          [log.id + '_' + c.id, c.id, log.time, log.event, log.type]);
      }
    }
    console.log("Inserted customers & logs");

    for (const contact of customerContactsData) {
      await client.query('INSERT INTO customer_contacts (id, customer_id, type, value) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
        [contact.id, contact.customer_id, contact.type, contact.value]);
    }

    for (const d of documentsData) {
      await client.query('INSERT INTO documents (id, title, pieces, status, date) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
        [d.id, d.title, d.pieces, d.status, d.date]);
    }

    for (const a of agentsData) {
      await client.query('INSERT INTO agents (id, name, role, status, tasks, harness) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
        [a.id, a.name, a.role, a.status, a.tasks, a.harness]);
    }

    for (const u of systemUsersData) {
      await client.query('INSERT INTO system_users (id, name, email, role, status, permissions) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
        [u.id, u.name, u.email, u.role, u.status, JSON.stringify(u.permissions)]);
    }

    for (const r of agentRunsData) {
      await client.query('INSERT INTO agent_runs (id, customer_id, agent_id, task_type, status, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
        [r.id, r.customer_id, r.agent_id, r.task_type, r.status, r.created_at]);
    }

    for (const s of agentStepsData) {
      await client.query('INSERT INTO agent_steps (id, run_id, step_type, tool_name, status, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
        [s.id, s.run_id, s.step_type, s.tool_name, s.status, s.created_at]);
    }

    for (const a of agentApprovalsData) {
      await client.query('INSERT INTO agent_approvals (id, run_id, action_type, proposed_payload, status, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
        [a.id, a.run_id, a.action_type, a.proposed_payload, a.status, a.created_at]);
    }

    for (const m of inboxData) {
      await client.query('INSERT INTO inbox_messages (id, sender, target, intent, subject, summary, channel, date, read) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING',
        [m.id, m.sender, m.target, m.intent, m.subject, m.summary, m.channel, m.date, m.read]);
    }

    for (const t of threadData) {
      await client.query('INSERT INTO thread_messages (id, message_id, sender, content, time) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
        [t.id, t.message_id, t.sender, t.content, t.time]);
    }

    console.log("Import complete!");
  } catch(e) {
    console.error("Seeding failed", e);
  } finally {
    await client.end();
  }
}

seed();
