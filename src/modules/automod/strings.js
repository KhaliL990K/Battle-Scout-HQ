/** Copy for the automod module. */
export const STRINGS = Object.freeze({
  dm: (hours) =>
    `Your messages in **BattleScout HQ** looked like spam from a compromised account, so they were removed and you were timed out for ${hours} hour${hours === 1 ? '' : 's'}.\nIf this was not you: change your Discord password, remove any authorised apps you do not recognise (User Settings > Authorized Apps), and turn on two-factor authentication. A staff member will review this.`,
  timeoutReason: (signal) => `Automod: ${signal}`,
  missingCase: 'That case no longer exists.',
  alreadyDecided: 'A decision was already made on this case.',
  noQuarantineRole: 'Set a quarantine role in the Automod panel first.',
  memberGone: 'That member is no longer in the server.',
  cannotAct: 'The bot cannot moderate that member (role hierarchy or ownership).',
  confirmKick: (tag) => `Kick **${tag}**? They can rejoin with an invite.`,
  confirmBan: (tag) => `Ban **${tag}**? Their messages from the last day are removed too.`,
  failed: (what) => `Could not ${what}. The case is unchanged.`,
  badNumbers: 'Every value must be a whole number inside the allowed range.',
});
