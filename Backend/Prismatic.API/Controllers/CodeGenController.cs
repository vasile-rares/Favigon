using Prismatic.Application.DTOs.Requests;
using Prismatic.Application.DTOs.Responses;
using Prismatic.Application.Pipeline;
using Microsoft.AspNetCore.Mvc;

namespace Prismatic.API.Controllers;

[ApiController]
[Route("api/codegen")]
public class CodeGenController(CodeGenerationPipeline pipeline) : ControllerBase
{
    /// <summary>
    /// Generates code from an IR node tree.
    /// POST /api/codegen/generate
    /// Body: { "framework": "html", "flavor": null, "ir": { ...IRNode... } }
    /// </summary>
    [HttpPost("generate")]
    public IActionResult Generate([FromBody] CodeGenRequest request)
    {
        if (request.Ir is null)
            return BadRequest(new { error = "IR node is required." });

        var result = pipeline.Generate(request.Ir, request.Framework, request.Flavor);

        if (!result.ValidationResult.IsValid)
            return UnprocessableEntity(new
            {
                error = "IR validation failed.",
                errors = result.ValidationResult.Errors
                                   .Select(e => new { path = e.Path, message = e.Message })
            });

        if (!result.IsSuccess)
            return BadRequest(new { error = result.ErrorMessage });

        return Ok(new CodeGenResponse
        {
            Framework = request.Framework,
            Flavor = request.Flavor,
            Html = result.Html!,
            Css = result.Css!
        });
    }

    /// <summary>
    /// Validates an IR node tree without generating code.
    /// POST /api/codegen/validate
    /// Body: { "ir": { ...IRNode... } }  — same shape as /generate
    /// </summary>
    [HttpPost("validate")]
    public IActionResult Validate([FromBody] CodeGenRequest request)
    {
        if (request.Ir is null)
            return BadRequest(new { error = "IR node is required." });

        var result = pipeline.Validate(request.Ir);

        return Ok(new CodeGenValidationResponse
        {
            IsValid = result.IsValid,
            Errors = result.Errors.Select(e => new CodeGenValidationError { Path = e.Path, Message = e.Message })
        });
    }
}


