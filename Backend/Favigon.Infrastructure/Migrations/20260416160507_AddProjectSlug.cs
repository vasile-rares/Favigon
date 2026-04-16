using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Favigon.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectSlug : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Add as nullable first so we can backfill existing rows
            migrationBuilder.AddColumn<string>(
                name: "Slug",
                table: "projects",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            // Backfill: generate a slug from the project name (lowercase + replace non-alphanum with hyphen)
            // Uses the raw id as a suffix to guarantee uniqueness across users for existing data
            migrationBuilder.Sql(@"
                UPDATE projects
                SET ""Slug"" = regexp_replace(
                    regexp_replace(
                        regexp_replace(lower(trim(""Name"")), '[^a-z0-9\s-]', '', 'g'),
                        '\s+', '-', 'g'),
                    '-{2,}', '-', 'g')
                    || '-' || cast(""Id"" as text)
            ");

            // Make non-nullable now that every row has a value
            migrationBuilder.AlterColumn<string>(
                name: "Slug",
                table: "projects",
                type: "character varying(150)",
                maxLength: 150,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(150)",
                oldMaxLength: 150,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_projects_UserId_Slug",
                table: "projects",
                columns: new[] { "UserId", "Slug" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_projects_UserId_Slug",
                table: "projects");

            migrationBuilder.DropColumn(
                name: "Slug",
                table: "projects");
        }
    }
}
