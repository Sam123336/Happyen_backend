import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationFn } from 'umzug';

/** The city streak: days in a row the account opened the app, and the last one. */
export const up: MigrationFn<QueryInterface> = async ({
  context: queryInterface,
}) => {
  await queryInterface.addColumn('profiles', 'streak_days', {
    allowNull: false,
    defaultValue: 0,
    type: DataTypes.INTEGER,
  });
  await queryInterface.addColumn('profiles', 'streak_last_active_on', {
    type: DataTypes.DATEONLY,
  });
};

export const down: MigrationFn<QueryInterface> = async ({
  context: queryInterface,
}) => {
  await queryInterface.removeColumn('profiles', 'streak_last_active_on');
  await queryInterface.removeColumn('profiles', 'streak_days');
};
