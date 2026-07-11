/**
 * @file logger.ts
 * @description Provides a centralized, styled logging utility for the CLI.
 * Ensures consistent formatting (using badges and colors) across all CLI outputs.
 * Follows the Single Responsibility Principle by encapsulating all UI logging logic.
 */

import chalk from 'chalk';

/**
 * The centralized logger instance used across the CLI to ensure consistent output styling.
 */
export const logger = {
  /**
   * Logs a success message with a green background badge.
   * @param msg The message to display.
   */
  success: (msg: string) => console.log(`${chalk.bgGreen.black.bold(' SUCCESS ')} ${msg}`),

  /**
   * Logs an informational message with a blue background badge.
   * @param msg The message to display.
   */
  info: (msg: string) => console.log(`${chalk.bgBlue.black.bold(' INFO ')} ${msg}`),

  /**
   * Logs an error message with a red background badge.
   * Output goes to stderr.
   * @param msg The error message to display.
   */
  error: (msg: string) => console.error(`\n${chalk.bgRed.white.bold(' ERROR ')} ${chalk.red(msg)}`),

  /**
   * Logs a warning message with a yellow background badge.
   * @param msg The warning message to display.
   */
  warn: (msg: string) => console.log(`${chalk.bgYellow.black.bold(' WARN ')} ${chalk.yellow(msg)}`),
  
  /**
   * Prints an empty line for spacing.
   */
  blank: () => console.log(''),

  /**
   * Prints a formatted header for the CLI or command.
   * @param title The main title of the tool.
   * @param subtitle An optional subtitle or version number.
   */
  header: (title: string, subtitle?: string) => {
    console.log(`\n${chalk.blue.bold(title)} ${subtitle ? chalk.gray(subtitle) : ''}`);
  },

  /**
   * Prints a subtle hint or descriptive text in gray.
   * @param msg The hint text.
   */
  hint: (msg: string) => console.log(`${chalk.gray(msg)}`),

  /**
   * Prints a list of actionable next steps for the user.
   * @param steps Array of string commands/steps to display.
   */
  nextSteps: (steps: string[]) => {
    console.log(`\n${chalk.gray('Next steps:')}`);
    steps.forEach(step => console.log(`  ${chalk.cyan(step)}`));
    console.log('');
  }
};
