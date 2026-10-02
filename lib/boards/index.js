const RESERVED_NAMES = new Set(['new', 'edit', 'delete', 'admin', 'settings', 'mod', 'api']);

const NAME_PATTERN = /^[a-z0-9_]+$/;

export function validateBoardInput(input, { isEdit = false } = {}) {
  const errors = {};
  const value = {};

  if (!isEdit) {
    let name = input.name;
    if (name === undefined || name === null || name === '') {
      errors.name = 'Name is required';
    } else {
      name = name.trim().toLowerCase();
      if (name.length < 3) {
        errors.name = 'Name must be at least 3 characters';
      } else if (name.length > 30) {
        errors.name = 'Name must be at most 30 characters';
      } else if (!NAME_PATTERN.test(name)) {
        errors.name = 'Name must contain only lowercase letters, digits, and underscores';
      } else if (RESERVED_NAMES.has(name)) {
        errors.name = 'That name is reserved';
      }
      value.name = name;
    }
  }

  let title = input.title;
  if (title === undefined || title === null || title === '') {
    errors.title = 'Title is required';
  } else {
    title = title.trim();
    if (title.length < 1) {
      errors.title = 'Title is required';
    } else if (title.length > 100) {
      errors.title = 'Title must be at most 100 characters';
    }
    value.title = title;
  }

  let description = input.description;
  if (description !== undefined && description !== null && description !== '') {
    description = description.trim();
    if (description.length > 500) {
      errors.description = 'Description must be at most 500 characters';
    }
    value.description = description;
  } else {
    value.description = null;
  }

  let rules = input.rules;
  if (rules !== undefined && rules !== null && rules !== '') {
    rules = rules.trim();
    if (rules.length > 5000) {
      errors.rules = 'Rules must be at most 5000 characters';
    }
    value.rules = rules;
  } else {
    value.rules = null;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value };
}

export function parseRules(text) {
  if (text === null || text === undefined) {
    return [];
  }
  const trimmed = text.trim();
  if (trimmed === '') {
    return [];
  }
  return trimmed.split('\n').map(line => line.trim()).filter(line => line.length > 0);
}

export function canEditBoard(userId, board) {
  if (userId === undefined || userId === null) {
    return false;
  }
  return userId === board.creator_id;
}

export function canDeleteBoard(userId, board) {
  if (!canEditBoard(userId, board)) {
    return false;
  }
  return board.name !== 'general';
}
